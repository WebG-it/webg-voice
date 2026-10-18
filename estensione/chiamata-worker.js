// Motore della trascrizione delle call: Parakeet TDT in ONNX Runtime Web, in un Web Worker dentro
// l'offscreen document. Scarica i file a richiesta (lib/scarica.js: a pezzi, con ripresa e SHA-256)
// e trascrive i segmenti che l'offscreen ritaglia alle pause, uno alla volta nell'ordine di arrivo.

import { Parakeet, leggiVocabolario } from './lib/parakeet.js';
import { ottieni } from './lib/scarica.js';
import * as archivio from './lib/archivio.js';
import { chiave } from './lib/modelli.js';
import { FILE_CHIAMATA, MODELLO_CHIAMATA as M, FILE_DEL_MODELLO_CHIAMATA, byteChiamata } from './lib/modelli-chiamata.js';

const qui = (p) => new URL(p, import.meta.url).href;
const invia = (m) => self.postMessage(m);

let ort = null;
async function caricaOrt() {
  if (ort) return ort;
  ort = await import('./vendor/ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = qui('./vendor/ort/');
  // come la lettura e la dettatura: uno in meno dei fili logici, 8 al massimo
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  return ort;
}

let motore = null; // { parakeet, info }
let caricando = null;

async function modelloInCache() {
  for (const k of FILE_DEL_MODELLO_CHIAMATA) if (!(await archivio.esiste(chiave(k)))) return false;
  return true;
}

async function carica() {
  if (motore) return motore.info;
  const t0 = performance.now();
  const avanz = (p) => invia({ tipo: 'progresso', ...p, totale: byteChiamata });
  let o;
  try {
    o = await caricaOrt();
  } catch (e) {
    throw new Error(`Il motore non parte: ${(e && e.message) || e}`);
  }
  // i file piccoli prima; l'encoder (650 MB) per ultimo e subito in una sessione, cosi' i suoi
  // byte non restano in memoria oltre il tempo che serve
  let base = 0;
  const prendi = async (k) => {
    const b = await ottieni(k, avanz, base, byteChiamata);
    base += FILE_CHIAMATA[k].byte;
    return b;
  };
  const voc = await prendi(M.vocabolario);
  const spettro = await prendi(M.spettro);
  const dec = await prendi(M.decoder);
  invia({ tipo: 'progresso', fase: 'avvio' });
  const opz = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const pre = await o.InferenceSession.create(spettro, opz);
  const dj = await o.InferenceSession.create(dec, opz);
  let enc;
  {
    const bytes = await prendi(M.encoder);
    invia({ tipo: 'progresso', fase: 'avvio' });
    enc = await o.InferenceSession.create(bytes, opz);
  }
  const parakeet = new Parakeet(o, { pre, enc, dj, vocab: leggiVocabolario(new TextDecoder().decode(voc)) });
  const info = { motore: 'parakeet', fili: o.env.wasm.numThreads, isolato: self.crossOriginIsolated, caricamentoMs: Math.round(performance.now() - t0) };
  motore = { parakeet, info };
  return info;
}

async function cancellaModello() {
  for (const k of FILE_DEL_MODELLO_CHIAMATA) {
    await archivio.cancella(chiave(k));
    for (let i = 0; i < 50; i++) await archivio.cancella(`v1/parti/${k}/${i}`);
  }
  if (motore) {
    await motore.parakeet.rilascia();
    motore = null;
  }
}

// le richieste si eseguono una alla volta, nell'ordine di arrivo
let catena = Promise.resolve();
const annullate = new Set();
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === 'annulla') {
    annullate.add(m.quale);
    return;
  }
  catena = catena.then(() => gestisci(m)).catch((e) => invia({ tipo: 'errore', id: m.id, messaggio: String(e && e.message ? e.message : e), download: !!(e && e.download) }));
};

async function gestisci(m) {
  switch (m.tipo) {
    case 'carica':
      caricando ??= carica().finally(() => (caricando = null));
      invia({ tipo: 'pronto', id: m.id, info: await caricando });
      return;
    case 'trascrivi': {
      if (annullate.delete(m.id)) {
        invia({ tipo: 'testo', id: m.id, annullato: true, testo: '' });
        return;
      }
      if (!motore) await carica();
      const r = await motore.parakeet.trascrivi(m.audio, { annullato: () => annullate.has(m.id) });
      annullate.delete(m.id);
      invia({ tipo: 'testo', id: m.id, ...r });
      return;
    }
    case 'statoCache':
      invia({ tipo: 'statoCache', id: m.id, completo: await modelloInCache() });
      return;
    case 'cancella':
      await cancellaModello();
      invia({ tipo: 'cancellato', id: m.id });
      return;
    default:
      invia({ tipo: 'errore', id: m.id, messaggio: `comando sconosciuto: ${m.tipo}` });
  }
}
