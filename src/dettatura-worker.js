// Motore della dettatura: Whisper in ONNX Runtime Web, in un Web Worker dentro l'offscreen
// document. Un worker per volta e per tipo: `?ep=wasm` (processore) oppure `?ep=webgpu` (scheda
// video, modello "Qualita'"). Scarica i file a richiesta (lib/scarica.js: a pezzi, con ripresa,
// SHA-256 e fonte di riserva), trascrive i segmenti che l'offscreen ritaglia alle pause.

import { Whisper } from './lib/whisper.js';
import { creaTokenizzatore } from './lib/tokenizzatore.js';
import { ottieni } from './lib/scarica.js';
import * as archivio from './lib/archivio.js';
import { chiave } from './lib/modelli.js';
import { MODELLI_DETTATURA, FILE_DETTATURA, modelloDettaturaValido, byteModello } from './lib/modelli-dettatura.js';

const EP = new URL(import.meta.url).searchParams.get('ep') === 'webgpu' ? 'webgpu' : 'wasm';
const qui = (p) => new URL(p, import.meta.url).href;
const invia = (m) => self.postMessage(m);

let ortPromessa = null;
function caricaOrt() {
  ortPromessa ??= import(EP === 'webgpu' ? './vendor/ort/ort.webgpu.min.mjs' : './vendor/ort/ort.wasm.min.mjs').then((ort) => {
    ort.env.wasm.wasmPaths = qui('./vendor/ort/');
    // come la lettura: 8 fili al massimo (oltre peggiora), uno in meno dei fili logici
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    return ort;
  });
  return ortPromessa;
}

let attuale = null; // { id, whisper, info }
let caricando = null;

/** true se tutti i file del modello sono gia' sul computer. */
async function modelloInCache(id) {
  const m = MODELLI_DETTATURA[modelloDettaturaValido(id)];
  const enc = (await archivio.esiste(chiave(m.encoder))) || (await archivio.esiste(chiave(m.encoderIntero)));
  return enc && (await archivio.esiste(chiave(m.decoder))) && (await archivio.esiste(chiave(m.tokenizzatore)));
}

async function carica(id) {
  const mid = modelloDettaturaValido(id);
  if (attuale && attuale.id === mid) return attuale.info;
  const m = MODELLI_DETTATURA[mid];
  if (m.ep !== EP) throw new Error(`il modello ${m.nome} gira su ${m.ep}, questo motore su ${EP}`);
  const t0 = performance.now();
  const totale = byteModello(mid);
  const avanz = (p) => invia({ tipo: 'progresso', modello: mid, ...p, totale });
  if (EP === 'webgpu') {
    // prima la scheda video, poi (solo se c'e') ONNX Runtime per WebGPU
    let a = null;
    try {
      a = navigator.gpu && (await navigator.gpu.requestAdapter());
    } catch {}
    if (!a || !a.features.has('shader-f16')) throw new Error('Questo computer non ha la scheda video adatta per il modello Qualità. Scegli Normale.');
  }
  let ort;
  try {
    ort = await caricaOrt();
  } catch (e) {
    throw new Error(EP === 'webgpu' ? `La scheda video non riesce ad avviare il modello Qualità (${(e && e.message) || e}). Scegli Normale.` : `Il motore non parte: ${(e && e.message) || e}`);
  }
  // tokenizzatore e decoder prima, poi l'encoder ritoccato; se l'encoder ritoccato non si scarica
  // da nessuna fonte, la riserva e' l'originale (finestra intera di 30 s, piu' lento)
  let base = 0;
  const tj = await ottieni(m.tokenizzatore, avanz, base, totale);
  base += FILE_DETTATURA[m.tokenizzatore].byte;
  const dec = await ottieni(m.decoder, avanz, base, totale);
  base += FILE_DETTATURA[m.decoder].byte;
  let enc;
  let finestraVariabile = true;
  let riserva = null;
  try {
    enc = await ottieni(m.encoder, avanz, base, totale);
  } catch (e) {
    riserva = String((e && e.message) || e);
    console.warn('encoder ritoccato non disponibile, uso la riserva:', riserva);
    enc = await ottieni(m.encoderIntero, avanz, base, totale);
    finestraVariabile = false;
  }
  invia({ tipo: 'progresso', modello: mid, fase: 'avvio' });
  if (attuale) {
    try {
      await attuale.whisper.encoder.release();
      await attuale.whisper.decoder.release();
    } catch {}
    attuale = null;
  }
  const opz = { executionProviders: [EP], graphOptimizationLevel: 'all' };
  const encoder = await ort.InferenceSession.create(enc, opz);
  const opzDec = { ...opz };
  if (EP === 'webgpu') {
    // la cache resta sulla scheda video fra un passo e l'altro
    const dove = {};
    for (let i = 0; i < m.layer; i++) for (const a of ['decoder', 'encoder']) for (const b of ['key', 'value']) dove[`present.${i}.${a}.${b}`] = 'gpu-buffer';
    opzDec.preferredOutputLocation = dove;
  }
  const decoder = await ort.InferenceSession.create(dec, opzDec);
  const tok = creaTokenizzatore(JSON.parse(new TextDecoder().decode(tj)));
  const whisper = new Whisper(ort, { encoder, decoder, tok, nMel: m.nMel, teste: m.teste, dimTesta: m.dimTesta, finestraVariabile, gpu: EP === 'webgpu' });
  const info = {
    modello: mid,
    ep: EP,
    finestraVariabile,
    riserva,
    fili: ort.env.wasm.numThreads,
    isolato: self.crossOriginIsolated,
    caricamentoMs: Math.round(performance.now() - t0),
  };
  attuale = { id: mid, whisper, info };
  return info;
}

/** Velocita' del computer prima di scaricare: una moltiplicazione di matrici come quelle di Whisper. */
async function misuraPC() {
  const ort = await caricaOrt();
  if (EP === 'webgpu') {
    const a = navigator.gpu && (await navigator.gpu.requestAdapter());
    if (!a) return { ep: EP, disponibile: false };
  }
  const byte = new Uint8Array(await (await fetch(qui('./misura.onnx'))).arrayBuffer());
  const s = await ort.InferenceSession.create(byte, { executionProviders: [EP] });
  const M = 512;
  const K = 768;
  const N = 768;
  const a = new Float32Array(M * K).map((_, i) => ((i * 7919) % 1000) / 1000 - 0.5);
  const b = new Float32Array(K * N).map((_, i) => ((i * 104729) % 1000) / 1000 - 0.5);
  const feeds = { a: new ort.Tensor('float32', a, [M, K]), b: new ort.Tensor('float32', b, [K, N]) };
  for (let i = 0; i < 3; i++) await s.run(feeds);
  // 6 serie da 5: si tiene la serie migliore, cosi' un momento di carico del computer non pesa
  let ms = Infinity;
  for (let serie = 0; serie < 6; serie++) {
    const t = performance.now();
    for (let i = 0; i < 5; i++) await s.run(feeds);
    ms = Math.min(ms, (performance.now() - t) / 5);
    await new Promise((r) => setTimeout(r, 50));
  }
  await s.release();
  return { ep: EP, disponibile: true, gflops: +((2 * M * K * N) / (ms / 1000) / 1e9).toFixed(1), fili: ort.env.wasm.numThreads };
}

async function cancellaModello(id) {
  const m = MODELLI_DETTATURA[modelloDettaturaValido(id)];
  for (const k of [m.encoder, m.encoderIntero, m.decoder]) {
    await archivio.cancella(chiave(k));
    for (let i = 0; i < 40; i++) await archivio.cancella(`v1/parti/${k}/${i}`);
  }
  if (attuale && attuale.id === id) attuale = null;
}

// le richieste si eseguono una alla volta, nell'ordine di arrivo
let catena = Promise.resolve();
const annullate = new Set();
self.onmessage = (ev) => {
  const m = ev.data;
  // annulla subito (fuori dalla coda): la trascrizione in corso si ferma al prossimo token
  if (m.tipo === 'annulla') {
    annullate.add(m.quale);
    return;
  }
  catena = catena
    .then(() => gestisci(m))
    .catch((e) => invia({ tipo: 'errore', id: m.id, messaggio: String(e && e.message ? e.message : e), download: !!(e && e.download) }));
};

async function gestisci(m) {
  switch (m.tipo) {
    case 'carica': {
      caricando = carica(m.modello).finally(() => (caricando = null));
      invia({ tipo: 'pronto', id: m.id, info: await caricando });
      return;
    }
    case 'trascrivi': {
      if (annullate.delete(m.id)) {
        invia({ tipo: 'testo', id: m.id, annullato: true, testo: '' });
        return;
      }
      if (!attuale) await carica(m.modello);
      const annullato = () => annullate.has(m.id);
      let r = await attuale.whisper.trascrivi(m.audio, { prompt: m.prompt, margine: 1, annullato });
      // ripetizione (allucinazione tipica di Whisper quando il contesto lo trascina): si riprova
      // senza il testo precedente, con i soli termini del dizionario
      if (r.ripetuto && !r.annullato && m.promptBase !== undefined && m.promptBase !== m.prompt) {
        const r2 = await attuale.whisper.trascrivi(m.audio, { prompt: m.promptBase, margine: 1, annullato });
        if (!r2.ripetuto || r2.testo.length > r.testo.length) r = { ...r2, riprovato: true };
      }
      annullate.delete(m.id);
      invia({ tipo: 'testo', id: m.id, ...r, modello: attuale.id });
      return;
    }
    case 'misura': {
      if (!attuale) await carica(m.modello);
      invia({ tipo: 'misura', id: m.id, modello: attuale.id, ep: EP, ...(await attuale.whisper.misura()) });
      return;
    }
    case 'misuraPC':
      invia({ tipo: 'misuraPC', id: m.id, ...(await misuraPC()) });
      return;
    case 'statoCache':
      invia({ tipo: 'statoCache', id: m.id, completo: await modelloInCache(m.modello) });
      return;
    case 'cancella':
      await cancellaModello(modelloDettaturaValido(m.modello));
      invia({ tipo: 'cancellato', id: m.id });
      return;
    // @@test-inizio
    case 'fontiProva': {
      // solo test: i file dei modelli arrivano da un server locale
      const { impostaFontiProva } = await import('./lib/scarica.js');
      impostaFontiProva((u) => m.mappa[u] || null);
      invia({ tipo: 'ok', id: m.id });
      return;
    }
    // @@test-fine
    default:
      invia({ tipo: 'errore', id: m.id, messaggio: `comando sconosciuto: ${m.tipo}` });
  }
}
