// Motore di sintesi: gira in un Web Worker dentro l'offscreen document, cosi'
// l'inferenza non blocca l'audio e i comandi (pausa, stop).
//
// Catena: testo -> normalizza -> espeak-ng 1.52 (WASM) -> fonemi IPA -> id del
// vocabolario Kokoro -> ONNX Runtime Web (WASM, multithread se possibile) con lo
// style vector di if_sara scelto sulla lunghezza dei token -> audio 24 kHz.

import * as ort from './vendor/ort/ort.wasm.min.mjs';
import creaEspeak from './vendor/espeak/espeak-ng.mjs';
import { avviaEspeak } from './lib/espeak.js';
import { creaFonemizzatore, tokenizza, dividiFonemi, pausaDopo, MAX_FONEMI } from './lib/fonemi.js';
import { normalizza } from './lib/normalizza.js';
import { applicaDizionario, creaFonemizzatoreMisto } from './lib/pronuncia.js';
import { blocchi, pezzi } from './lib/testo.js';
import { ritaglia, conPausa } from './lib/audio.js';
import { ottieni, byteInCache } from './lib/scarica.js';
import { FILE_REMOTI, VOCI, voceValida, chiave } from './lib/modelli.js';
import { esiste } from './lib/archivio.js';

const DIM_STILE = 256;

let pronto = null; // Promise del caricamento
// Se il caricamento fallisce (es. download interrotto) la volta dopo si riprova
const motore = () =>
  (pronto ??= carica().catch((e) => {
    pronto = null;
    throw e;
  }));
let sessione = null;
// variante del modello: 'massima' (fp32) o 'bilanciata' (uint8), vedi lib/motore-lettura.js
let variante = 'massima';
let nomeIds = 'input_ids';
const voci = {}; // id della voce -> Float32Array 510 x 256 (stile)
let fonemizza = null; // default dell'estensione
let fonemizzaFedele = null; // identico a kokoro-onnx (marcatori di lingua inclusi)
let infoMotore = {};

const invia = (m, trasf) => self.postMessage(m, trasf || []);

async function carica() {
  const t0 = performance.now();
  const qui = (p) => new URL(p, import.meta.url).href;
  // eSpeak e modello si caricano insieme: la partenza a freddo non li paga uno dopo l'altro
  const [espeakMs, info] = await Promise.all([caricaEspeak(qui), caricaModello(qui, t0)]);
  info.fasi.espeakMs = espeakMs;
  info.caricamentoMs = Math.round(performance.now() - t0);
  return info;
}

async function caricaEspeak(qui) {
  const t0 = performance.now();
  const [wasmE, indiceE, datiE] = await Promise.all([
    fetch(qui('./vendor/espeak/espeak-ng.wasm')).then((r) => r.arrayBuffer()),
    fetch(qui('./vendor/espeak/espeak-dati.json')).then((r) => r.json()),
    fetch(qui('./vendor/espeak/espeak-dati.bin')).then((r) => r.arrayBuffer()),
  ]);
  const clausole = await avviaEspeak({
    creaModulo: creaEspeak,
    wasm: new Uint8Array(wasmE),
    indice: indiceE,
    dati: new Uint8Array(datiE),
  });
  // italiano con la voce italiana di espeak, parole inglesi con quella americana
  const fonIt = creaFonemizzatore(clausole, { rimuoviMarcatori: true });
  const fonEn = creaFonemizzatore((t) => clausole(t, 'en-us'), { rimuoviMarcatori: true });
  fonemizza = creaFonemizzatoreMisto(fonIt, fonEn);
  fonemizzaFedele = creaFonemizzatore(clausole);
  return Math.round(performance.now() - t0);
}

async function caricaModello(qui, t0) {
  const avanz = (p) => invia({ tipo: 'progresso', fase: 'download', ...p });
  const byteVoce = await ottieni('voce', avanz, 0);
  voci.sara = comeStile(byteVoce);
  const byteModello = variante === 'bilanciata' ? await ottieni('modelloU8', avanz, 0) : await ottieni('modello', avanz, FILE_REMOTI.voce.byte);
  const tLetto = performance.now();

  invia({ tipo: 'progresso', fase: 'avvio' });
  // misurato su 16 fili logici: 8 e' il punto migliore, oltre peggiora
  let fili = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  ort.env.wasm.wasmPaths = qui('./vendor/ort/');
  ort.env.wasm.numThreads = fili;
  sessione = await ort.InferenceSession.create(byteModello, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  nomeIds = sessione.inputNames.includes('input_ids') ? 'input_ids' : 'tokens';
  infoMotore = {
    // fasi del caricamento: lettura di modello e voce dall'archivio locale, creazione della sessione
    fasi: { letturaMs: Math.round(tLetto - t0), sessioneMs: Math.round(performance.now() - tLetto) },
    fili,
    isolato: self.crossOriginIsolated,
    caricamentoMs: Math.round(performance.now() - t0),
    ingressi: sessione.inputNames,
  };
  return infoMotore;
}

const comeStile = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

// Le voci in piu' (Nicola) si scaricano la prima volta che servono: mezzo MB,
// stessa verifica SHA-256 del modello. L'avanzamento ha il nome del file.
const caricandoVoce = new Map();
async function stileVoce(id) {
  const v = voceValida(id);
  if (voci[v]) return voci[v];
  if (!caricandoVoce.has(v)) {
    const avanz = (p) => invia({ tipo: 'progresso', fase: 'download', voce: v, ...p });
    caricandoVoce.set(
      v,
      ottieni(VOCI[v].file, avanz, 0)
        .then((b) => (voci[v] = comeStile(b)))
        .catch((e) => {
          console.warn(e);
          throw new Error(`Non riesco a scaricare la voce ${VOCI[v].nome} (mezzo MB): controlla la connessione e riprova, oppure scegli un'altra voce.`);
        })
        .finally(() => caricandoVoce.delete(v))
    );
  }
  return caricandoVoce.get(v);
}

/** Una passata del modello su un lotto di fonemi (al massimo 510). */
async function inferenza(fonemi, velocita, voce) {
  const ids = tokenizza(fonemi);
  if (!ids.length) return new Float32Array(0);
  if (ids.length > MAX_FONEMI) throw new Error('lotto troppo lungo');
  const t = new BigInt64Array(ids.length + 2);
  ids.forEach((v, i) => (t[i + 1] = BigInt(v)));
  const riga = Math.min(ids.length, voce.length / DIM_STILE) - 1; // _style_for
  const stile = voce.slice(riga * DIM_STILE, (riga + 1) * DIM_STILE);
  const out = await sessione.run({
    [nomeIds]: new ort.Tensor('int64', t, [1, t.length]),
    style: new ort.Tensor('float32', stile, [1, DIM_STILE]),
    speed: new ort.Tensor('float32', Float32Array.of(velocita), [1]),
  });
  return out[sessione.outputNames[0]].data;
}

// Kokoro parla piu' lento sui lotti corti: misurato con if_sara (fp32) sul testo
// di prova, millisecondi per token in funzione della lunghezza del lotto.
// Il campione di riferimento e' un lotto unico di ~450 token (45 ms/token): per
// tenere lo stesso ritmo leggendo a blocchi, i blocchi corti si accelerano.
const RITMO = [[20, 77], [35, 61], [65, 53.5], [100, 52.5], [150, 52], [250, 51], [300, 50.3], [375, 47.5], [450, 45.3], [510, 45]];
export function fattoreRitmo(n) {
  let ms = RITMO[RITMO.length - 1][1];
  if (n <= RITMO[0][0]) ms = RITMO[0][1];
  else {
    for (let i = 1; i < RITMO.length; i++) {
      const [n0, m0] = RITMO[i - 1];
      const [n1, m1] = RITMO[i];
      if (n <= n1) {
        ms = m0 + ((m1 - m0) * (n - n0)) / (n1 - n0);
        break;
      }
    }
  }
  return Math.min(1.2, Math.max(1, ms / 45.3));
}

/** Come Kokoro._create_batch con trim=True: ritaglia e aggiunge la pausa. */
async function lotto(fonemi, velocita, pausa, compensa = false, idVoce) {
  const v = compensa ? velocita * fattoreRitmo(tokenizza(fonemi).length) : velocita;
  const a = await inferenza(fonemi, v, await stileVoce(idVoce));
  return conPausa(new Float32Array(ritaglia(a)), pausa);
}

// Le richieste si eseguono una alla volta, nell'ordine di arrivo
let catena = Promise.resolve();
const annullate = new Set();

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === 'annulla') {
    annullate.add(m.sessione);
    return;
  }
  catena = catena.then(() => gestisci(m)).catch((e) => {
    invia({ tipo: 'errore', id: m.id, messaggio: String(e && e.message ? e.message : e) });
  });
};

async function gestisci(m) {
  if (m.sessione !== undefined && annullate.has(m.sessione)) {
    invia({ tipo: 'annullato', id: m.id });
    return;
  }
  if (m.tipo === 'avvia') {
    // cambio di variante: il modello caricato si libera e si carica l'altro
    if ((m.variante === 'massima' || m.variante === 'bilanciata') && m.variante !== variante) {
      variante = m.variante;
      if (sessione) await sessione.release();
      sessione = null;
      pronto = null;
    }
    invia({ tipo: 'pronto', id: m.id, info: { ...(await motore()), variante } });
    return;
  }
  if (m.tipo === 'variantePronta') {
    invia({ tipo: 'variantePronta', id: m.id, pronta: await esiste(chiave('modelloU8')) });
    return;
  }
  if (m.tipo === 'scaricaVariante') {
    // in sottofondo, senza caricarla: servira' dalla prossima lettura
    await ottieni('modelloU8', (p) => invia({ tipo: 'progressoVariante', ...p }), 0);
    invia({ tipo: 'varianteScaricata', id: m.id });
    return;
  }
  if (m.tipo === 'libera') {
    // la dettatura su un computer con poca memoria: la voce pronta si libera, si ricarica alla lettura dopo
    if (sessione) await sessione.release();
    sessione = null;
    pronto = null;
    invia({ tipo: 'liberato', id: m.id });
    return;
  }
  if (m.tipo === 'statoCache') {
    invia({ tipo: 'statoCache', id: m.id, ...(await byteInCache()) });
    return;
  }
  if (m.tipo === 'preparaVoce') {
    // scarica (se manca) lo stile della voce scelta, senza bisogno del modello
    await stileVoce(m.voce);
    invia({ tipo: 'voce', id: m.id, voce: voceValida(m.voce) });
    return;
  }
  await motore();
  if (m.tipo === 'prepara') {
    const t = performance.now();
    const opz = m.opzioni || {};
    const testo = normalizza(applicaDizionario(m.testo, opz.dizionario));
    // lettura: pezzi da comporre durante la lettura; MP3: blocchi gia' composti
    if (opz.pezzi) invia({ tipo: 'pezzi', id: m.id, pezzi: pezzi(testo, fonemizza), ms: Math.round(performance.now() - t) });
    else invia({ tipo: 'blocchi', id: m.id, blocchi: blocchi(testo, fonemizza, opz), ms: Math.round(performance.now() - t) });
  } else if (m.tipo === 'sintetizza') {
    const t = performance.now();
    const audio = await lotto(m.fonemi, m.velocita, m.pausa, true, m.voce);
    const ms = performance.now() - t;
    // rapporto col tempo reale, sul parlato senza la pausa aggiunta
    const sec = audio.length / 24000 - (m.pausa || 0);
    invia({ tipo: 'audio', id: m.id, audio, ms: Math.round(ms), rtf: sec > 0 ? ms / 1000 / sec : null }, [audio.buffer]);
  } else if (m.tipo === 'fonemi') {
    const f = m.fedele ? fonemizzaFedele(m.testo) : fonemizza(m.normalizza ? normalizza(applicaDizionario(m.testo, m.dizionario)) : m.testo);
    invia({ tipo: 'fonemi', id: m.id, fonemi: f });
  }
}
