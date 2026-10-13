// Offscreen document: tiene il motore (Web Worker) e l'audio, cosi' la lettura
// continua anche a popup chiuso. E' la sola fonte di verita' sullo stato: lo
// pubblica a ogni cambio e il service worker lo gira alla barretta della scheda.

import { FREQUENZA, wav } from './lib/audio.js';

class Annullato extends Error {}

const worker = new Worker(new URL('./motore-worker.js', import.meta.url), { type: 'module' });
let idSeq = 0;
const attese = new Map();

worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === 'progresso') {
    progresso(m);
    return;
  }
  const a = attese.get(m.id);
  if (!a) return;
  attese.delete(m.id);
  if (m.tipo === 'errore') a.rifiuta(new Error(m.messaggio));
  else if (m.tipo === 'annullato') a.rifiuta(new Annullato());
  else a.risolvi(m);
};
worker.onerror = (e) => errore(new Error(`motore: ${e.message || 'errore nel worker'}`));

function chiedi(msg, trasf) {
  const id = ++idSeq;
  return new Promise((risolvi, rifiuta) => {
    attese.set(id, { risolvi, rifiuta });
    worker.postMessage({ ...msg, id }, trasf || []);
  });
}

const stato = {
  fase: 'inattivo', // inattivo | preparazione | lettura | pausa
  velocita: 1,
  blocco: 0,
  totale: 0,
  tabId: null,
  download: null,
  motorePronto: false,
  info: null,
  errore: null,
  metriche: {},
  versione: null, // l'offscreen document non ha chrome.runtime.getManifest: si legge sotto
};

// Dopo 10 minuti senza letture il documento si fa chiudere, cosi' il modello
// (circa 330 MB in memoria) non resta caricato per niente.
const RIPOSO_MS = 10 * 60 * 1000;
let timerRiposo = null;
function controllaRiposo() {
  clearTimeout(timerRiposo);
  if (stato.fase === 'inattivo') {
    timerRiposo = setTimeout(() => {
      if (stato.fase === 'inattivo') chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'riposo' }).catch(() => {});
    }, RIPOSO_MS);
  }
}

fetch('manifest.json')
  .then((r) => r.json())
  .then((m) => {
    stato.versione = m.version;
  })
  .catch(() => {});

let ultimoInvio = 0;
let invioRinviato = null;
function pubblica(subito = true) {
  const manda = () => {
    ultimoInvio = Date.now();
    controllaRiposo();
    chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'stato', stato }).catch(() => {});
  };
  if (subito) {
    clearTimeout(invioRinviato);
    invioRinviato = null;
    manda();
  } else if (!invioRinviato) {
    invioRinviato = setTimeout(() => {
      invioRinviato = null;
      manda();
    }, Math.max(0, 250 - (Date.now() - ultimoInvio)));
  }
}

function progresso(m) {
  stato.download =
    m.fase === 'download'
      ? { file: m.file, scaricati: m.scaricati, totale: m.totale, fonte: m.fonte, riprovo: m.riprovo }
      : { avvio: true };
  pubblica(false);
}

function errore(e) {
  console.error(e);
  const msg = String(e && e.message ? e.message : e);
  const L = lettura;
  if (L) ferma(false);
  stato.fase = 'inattivo';
  if (/download/i.test(msg) && stato.download && stato.download.totale) {
    // download interrotto: i pezzi gia' scaricati restano, "Riprova" riparte da li'
    stato.download = { ...stato.download, interrotto: true, riprovo: undefined, dettaglio: msg };
    stato.errore = `Download interrotto a ${Math.round(stato.download.scaricati / 1e6)} MB di ${Math.round(stato.download.totale / 1e6)} MB. Controlla la connessione e premi Riprova: riparte da dove si era fermato.`;
    if (L && L.richiesta) richiestaInAttesa = L.richiesta;
  } else {
    stato.errore = msg;
    stato.download = null;
  }
  pubblica();
}

let ctx = null;
function contesto() {
  if (!ctx) ctx = new AudioContext({ sampleRate: FREQUENZA, latencyHint: 'playback' });
  return ctx;
}

let caricamento = null;
function motore() {
  if (stato.motorePronto) return Promise.resolve();
  caricamento ??= chiedi({ tipo: 'avvia' })
    .then((r) => {
      stato.motorePronto = true;
      stato.info = r.info;
      stato.download = null;
      pubblica();
    })
    .finally(() => {
      caricamento = null;
    });
  return caricamento;
}

// Il primo download (circa 330 MB) parte solo dopo una conferma esplicita,
// dal popup o dalla barretta. La conferma vale finche' il documento e' aperto.
let consenso = false;
let richiestaInAttesa = null;

async function serveConsenso() {
  if (stato.motorePronto || consenso) return false;
  const c = await chiedi({ tipo: 'statoCache' });
  const completo = Object.values(c.completi).every(Boolean);
  if (completo) return false;
  stato.download = { scaricati: c.scaricati, totale: c.totale, inAttesa: true };
  return true;
}

function consenti() {
  consenso = true;
  const r = richiestaInAttesa;
  richiestaInAttesa = null;
  if (r) leggi(r.testo, r.velocita, r.tabId, Date.now(), r.rtf);
  else {
    stato.fase = 'preparazione';
    stato.errore = null;
    pubblica();
    motore()
      .then(() => {
        if (stato.fase === 'preparazione' && !lettura) {
          stato.fase = 'inattivo';
          pubblica();
        }
      })
      .catch(errore);
  }
}

// Stima del rapporto col tempo reale su questo PC (media mobile), per adattare
// la lettura: piu' blocchi in anticipo e partenza con un piccolo margine.
let rtf = null;
function aggiornaRtf(v) {
  if (typeof v !== 'number' || !isFinite(v)) return;
  rtf = rtf === null ? v : rtf * 0.7 + v * 0.3;
  stato.rtf = +rtf.toFixed(2);
}
const anticipo = () => (rtf === null || rtf < 0.8 ? 3 : rtf < 1 ? 4 : 6);
const bloccoIniziale = () => (rtf !== null && rtf >= 0.95 ? 2 : 1);

let lettura = null;
let ultimaLettura = null;
let seq = 0;

function sveglia(L) {
  const s = L.sveglia;
  L.sveglia = null;
  if (s) s();
}
function attendi(L) {
  return new Promise((r) => {
    L.sveglia = r;
  });
}

async function leggi(testo, velocita, tabId, t0, rtfSalvato) {
  ferma(false);
  if (rtf === null && typeof rtfSalvato === 'number') aggiornaRtf(rtfSalvato);
  if (await serveConsenso()) {
    richiestaInAttesa = { testo, velocita, tabId, rtf: rtfSalvato };
    Object.assign(stato, { fase: 'consenso', tabId: tabId ?? null, errore: null, blocco: 0, totale: 0 });
    pubblica();
    return;
  }
  const L = {
    id: ++seq,
    t0: t0 || Date.now(),
    blocchi: [],
    prossimo: 0,
    sorgenti: [],
    finePrevista: 0,
    generazione: 0,
    registrazione: [],
    richiesta: { testo, velocita, tabId, rtf: rtfSalvato },
  };
  lettura = ultimaLettura = L;
  if (typeof velocita === 'number') stato.velocita = velocita;
  Object.assign(stato, { fase: 'preparazione', tabId: tabId ?? null, errore: null, blocco: 0, totale: 0 });
  stato.metriche = {};
  pubblica();
  try {
    const c = contesto();
    if (c.state !== 'running') await c.resume();
    await motore();
    if (L !== lettura) return;
    const r = await chiedi({ tipo: 'prepara', testo, sessione: L.id, opzioni: { rtf } });
    if (L !== lettura) return;
    L.blocchi = r.blocchi;
    stato.totale = r.blocchi.length;
    stato.metriche.preparazioneMs = r.ms;
    if (!L.blocchi.length) {
      lettura = null;
      Object.assign(stato, { fase: 'inattivo', errore: 'Nel testo non c\'e\' niente da leggere.' });
      pubblica();
      return;
    }
    pompa(L);
  } catch (e) {
    if (L === lettura && !(e instanceof Annullato)) errore(e);
  }
}

// Sintetizza in anticipo: al massimo il blocco che suona piu' due in coda
async function pompa(L) {
  if (L.pompaAttiva) return;
  L.pompaAttiva = true;
  try {
    while (L === lettura && L.prossimo < L.blocchi.length) {
      const c = contesto();
      const davanti = L.sorgenti.filter((s) => s.fine > c.currentTime).length;
      if (davanti + (L.trattenuti ? L.trattenuti.length : 0) >= anticipo()) {
        await attendi(L);
        continue;
      }
      const i = L.prossimo;
      const gen = L.generazione;
      const b = L.blocchi[i];
      const r = await chiedi({ tipo: 'sintetizza', fonemi: b.fonemi, velocita: stato.velocita, pausa: b.pausa, sessione: L.id });
      if (L !== lettura) return;
      (stato.metriche.sintesiMs ||= []).push(r.ms);
      aggiornaRtf(r.rtf);
      if (gen !== L.generazione) continue; // la velocita' e' cambiata nel frattempo
      L.prossimo = i + 1;
      // su un PC lento si parte quando i primi due blocchi sono pronti
      if (i < bloccoIniziale() - 1 && L.blocchi.length > 1 && !L.partito) {
        (L.trattenuti ||= []).push([i, r.audio]);
        continue;
      }
      for (const [j, a] of L.trattenuti || []) programma(L, j, a);
      L.trattenuti = null;
      L.partito = true;
      programma(L, i, r.audio);
    }
  } catch (e) {
    if (L === lettura && !(e instanceof Annullato)) errore(e);
  } finally {
    L.pompaAttiva = false;
  }
}

function programma(L, i, audio) {
  const c = contesto();
  const buf = c.createBuffer(1, Math.max(1, audio.length), FREQUENZA);
  buf.copyToChannel(audio, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  const minimo = c.currentTime + 0.03;
  if (L.finePrevista && minimo > L.finePrevista && c.state === 'running') {
    stato.metriche.buchi = (stato.metriche.buchi || 0) + 1;
    (stato.metriche.buchiSec ||= []).push(+(minimo - L.finePrevista).toFixed(2));
  }
  const inizio = Math.max(minimo, L.finePrevista);
  src.start(inizio);
  const v = { src, inizio, fine: inizio + buf.duration, indice: i };
  L.sorgenti.push(v);
  L.finePrevista = v.fine;
  L.registrazione[i] = audio;
  if (i === 0 && stato.metriche.primoSuonoMs === undefined) {
    stato.metriche.primoSuonoMs = Math.round(Date.now() - L.t0 + (inizio - c.currentTime) * 1000);
  }
  if (stato.fase === 'preparazione') stato.fase = 'lettura';
  src.onended = () => {
    if (L !== lettura) return;
    L.sorgenti = L.sorgenti.filter((s) => s !== v);
    stato.blocco = Math.min(i + 1, L.blocchi.length);
    if (i === L.blocchi.length - 1 && L.sorgenti.length === 0) {
      lettura = null;
      stato.fase = 'inattivo';
      if (rtf !== null) chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'rtf', valore: rtf }).catch(() => {});
      pubblica();
      return;
    }
    sveglia(L);
    pubblica();
  };
  pubblica();
}

function ferma(pubblicare = true) {
  const L = lettura;
  if (L) {
    worker.postMessage({ tipo: 'annulla', sessione: L.id });
    for (const s of L.sorgenti) {
      s.src.onended = null;
      try {
        s.src.stop();
      } catch {}
    }
    L.sorgenti = [];
    lettura = null;
    sveglia(L);
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (pubblicare) {
    stato.fase = 'inattivo';
    pubblica();
  }
}

async function pausa() {
  if (!lettura || stato.fase === 'pausa') return;
  stato.fase = 'pausa';
  pubblica();
  await contesto().suspend();
}

async function riprendi() {
  if (!lettura || stato.fase !== 'pausa') return;
  await contesto().resume();
  stato.fase = lettura.sorgenti.length ? 'lettura' : 'preparazione';
  pubblica();
}

function impostaVelocita(v) {
  const vel = Math.min(1.5, Math.max(0.7, Number(v) || 1));
  if (vel === stato.velocita) return;
  stato.velocita = vel;
  const L = lettura;
  if (L) {
    // i blocchi gia' pronti ma non ancora partiti si rifanno alla nuova velocita'
    L.generazione++;
    const c = contesto();
    const tenute = [];
    let primoScartato = Infinity;
    for (const s of L.sorgenti) {
      if (s.inizio > c.currentTime + 0.05) {
        s.src.onended = null;
        try {
          s.src.stop();
        } catch {}
        primoScartato = Math.min(primoScartato, s.indice);
      } else tenute.push(s);
    }
    L.sorgenti = tenute;
    if (primoScartato < L.prossimo) L.prossimo = primoScartato;
    L.finePrevista = tenute.length ? Math.max(...tenute.map((s) => s.fine)) : 0;
    sveglia(L);
    pompa(L);
  }
  pubblica();
}

chrome.runtime.onMessage.addListener((msg, _mittente, rispondi) => {
  if (!msg || msg.a !== 'offscreen') return;
  switch (msg.tipo) {
    case 'leggi':
      leggi(msg.testo, msg.velocita, msg.tabId, msg.t0, msg.rtf);
      break;
    case 'consenti':
      consenti();
      break;
    case 'rifiuta':
      richiestaInAttesa = null;
      Object.assign(stato, { fase: 'inattivo', download: null });
      break;
    case 'pausa':
      pausa();
      break;
    case 'riprendi':
      riprendi();
      break;
    case 'alterna':
      if (stato.fase === 'pausa') riprendi();
      else pausa();
      break;
    case 'stop':
      ferma();
      break;
    case 'velocita':
      impostaVelocita(msg.valore);
      break;
    case 'preparaMotore':
      consenti();
      break;
    case 'stato':
      break;
    default:
      return;
  }
  rispondi({ stato });
});

// ---- Solo per i test automatici (nessun effetto nell'uso normale) ----
function base64(byte) {
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}
function unisci(parti) {
  const pieni = parti.filter(Boolean);
  const out = new Float32Array(pieni.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of pieni) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
globalThis.__test = {
  stato: () => JSON.parse(JSON.stringify(stato)),
  blocchi: () => (ultimaLettura ? ultimaLettura.blocchi : []),
  registrazioneWav: () => {
    const a = unisci(ultimaLettura ? ultimaLettura.registrazione : []);
    return { secondi: a.length / FREQUENZA, wav: base64(wav(a)) };
  },
  fonemi: async (testo, opz = {}) => (await chiedi({ tipo: 'fonemi', testo, ...opz })).fonemi,
  sintesiFedele: async (testo, velocita = 1) => {
    await motore();
    const r = await chiedi({ tipo: 'sintesiFedele', testo, velocita });
    return { fonemi: r.fonemi, lotti: r.lotti, ms: r.ms, secondi: r.audio.length / FREQUENZA, wav: base64(wav(r.audio)) };
  },
  contesto: () => ({ stato: ctx && ctx.state, tempo: ctx && ctx.currentTime }),
  provaFonte: (url) => chiedi({ tipo: 'provaFonte', url }),
  statoCache: () => chiedi({ tipo: 'statoCache' }),
};
