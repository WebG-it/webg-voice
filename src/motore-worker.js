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
import { blocchi } from './lib/testo.js';
import { ritaglia, conPausa } from './lib/audio.js';
import { ottieni, byteInCache } from './lib/scarica.js';
import { FILE_REMOTI } from './lib/modelli.js';

const DIM_STILE = 256;

let pronto = null; // Promise del caricamento
// Se il caricamento fallisce (es. download interrotto) la volta dopo si riprova
const motore = () =>
  (pronto ??= carica().catch((e) => {
    pronto = null;
    throw e;
  }));
let sessione = null;
let nomeIds = 'input_ids';
let voce = null; // Float32Array 510 x 256
let fonemizza = null; // default dell'estensione
let fonemizzaFedele = null; // identico a kokoro-onnx (marcatori di lingua inclusi)
let infoMotore = {};

const invia = (m, trasf) => self.postMessage(m, trasf || []);

async function carica() {
  const t0 = performance.now();
  const qui = (p) => new URL(p, import.meta.url).href;
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

  const avanz = (p) => invia({ tipo: 'progresso', fase: 'download', ...p });
  const byteVoce = await ottieni('voce', avanz, 0);
  voce = new Float32Array(byteVoce.buffer, byteVoce.byteOffset, byteVoce.byteLength / 4);
  const byteModello = await ottieni('modello', avanz, FILE_REMOTI.voce.byte);

  invia({ tipo: 'progresso', fase: 'avvio' });
  ort.env.wasm.wasmPaths = qui('./vendor/ort/');
  // misurato su 16 fili logici: 8 e' il punto migliore, oltre peggiora
  const fili = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  ort.env.wasm.numThreads = fili;
  sessione = await ort.InferenceSession.create(byteModello, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  nomeIds = sessione.inputNames.includes('input_ids') ? 'input_ids' : 'tokens';
  infoMotore = {
    fili,
    isolato: self.crossOriginIsolated,
    caricamentoMs: Math.round(performance.now() - t0),
    ingressi: sessione.inputNames,
  };
  return infoMotore;
}

/** Una passata del modello su un lotto di fonemi (al massimo 510). */
async function inferenza(fonemi, velocita) {
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
async function lotto(fonemi, velocita, pausa, compensa = false) {
  const v = compensa ? velocita * fattoreRitmo(tokenizza(fonemi).length) : velocita;
  const a = await inferenza(fonemi, v);
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
    invia({ tipo: 'pronto', id: m.id, info: await motore() });
    return;
  }
  // @@test-inizio
  if (m.tipo === 'provaFonte') {
    // solo test: una richiesta Range verso una sorgente, dal worker (COEP attivo)
    const r = await fetch(m.url, { headers: { Range: 'bytes=0-1048575' }, cache: 'no-store' });
    const b = await r.arrayBuffer();
    invia({ tipo: 'provaFonte', id: m.id, stato: r.status, byte: b.byteLength, urlFinale: new URL(r.url).host, redirect: r.redirected });
    return;
  }
  if (m.tipo === 'svuotaCache') {
    // solo test: dimentica modello e parti scaricate
    await (await import('./lib/archivio.js')).svuota();
    invia({ tipo: 'svuotaCache', id: m.id });
    return;
  }
  // @@test-fine
  if (m.tipo === 'statoCache') {
    invia({ tipo: 'statoCache', id: m.id, ...(await byteInCache()) });
    return;
  }
  await motore();
  if (m.tipo === 'prepara') {
    const t = performance.now();
    const opz = m.opzioni || {};
    const b = blocchi(normalizza(applicaDizionario(m.testo, opz.dizionario)), fonemizza, opz);
    invia({ tipo: 'blocchi', id: m.id, blocchi: b, ms: Math.round(performance.now() - t) });
  } else if (m.tipo === 'sintetizza') {
    const t = performance.now();
    const audio = await lotto(m.fonemi, m.velocita, m.pausa, true);
    const ms = performance.now() - t;
    // rapporto col tempo reale, sul parlato senza la pausa aggiunta
    const sec = audio.length / 24000 - (m.pausa || 0);
    invia({ tipo: 'audio', id: m.id, audio, ms: Math.round(ms), rtf: sec > 0 ? ms / 1000 / sec : null }, [audio.buffer]);
  } else if (m.tipo === 'fonemi') {
    const f = m.fedele ? fonemizzaFedele(m.testo) : fonemizza(m.normalizza ? normalizza(applicaDizionario(m.testo, m.dizionario)) : m.testo);
    invia({ tipo: 'fonemi', id: m.id, fonemi: f });
  }
  // @@test-inizio
  else if (m.tipo === 'sintesiFedele') {
    // Kokoro.create(testo, "if_sara", speed, lang="it") di kokoro-onnx 0.6.1, passo per passo
    const t = performance.now();
    const f = fonemizzaFedele(m.testo);
    const lotti = dividiFonemi(f, MAX_FONEMI);
    const parti = [];
    for (let i = 0; i < lotti.length; i++) {
      const p = i < lotti.length - 1 ? pausaDopo(lotti[i]) : 0;
      parti.push(await lotto(lotti[i], m.velocita ?? 1, p));
    }
    const tot = parti.reduce((s, p) => s + p.length, 0);
    const audio = new Float32Array(tot);
    let o = 0;
    for (const p of parti) {
      audio.set(p, o);
      o += p.length;
    }
    invia({ tipo: 'audio', id: m.id, audio, fonemi: f, lotti: lotti.length, ms: Math.round(performance.now() - t) }, [audio.buffer]);
  }
  // @@test-fine
}
