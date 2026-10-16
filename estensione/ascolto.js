// Dettatura, lato offscreen document: microfono, ritaglio alle pause (lib/vad.js) e motore
// Whisper (dettatura-worker.js). Il testo grezzo va al service worker, che lo gira alla pagina
// dove la pulizia italiana (lib/pulizia.js) e l'inserimento nel campo avvengono.
//
// Il microfono si apre solo durante la dettatura e si chiude alla fine: l'indicatore nella
// pagina e quello di Chrome sulla scheda lo mostrano. L'audio non esce dal computer (salvo la
// riserva Web Speech, spenta di default e dichiarata nelle opzioni).

import { creaSegmentatore } from './lib/vad.js';
import { MODELLI_DETTATURA, modelloDettaturaValido } from './lib/modelli-dettatura.js';

const URL_BACKGROUND = new URL('background.js', location.href).href;
const pubblicaA = (m) => chrome.runtime.sendMessage({ da: 'offscreen', ...m }).catch(() => {});

const stato = {
  fase: 'inattiva', // inattiva | preparazione | ascolto | parlato | trascrivo | errore
  modello: null,
  motore: 'whisper', // whisper | webspeech
  download: null, // { scaricati, totale, file }
  info: null,
  errore: null,
  inCoda: 0,
  latenzaMs: null, // dalla fine del parlato al testo, media mobile
  ultimaMisura: null,
};
globalThis.dettaturaAttiva = false;

function pubblica() {
  pubblicaA({ tipo: 'statoDettatura', stato });
}

// ---- motori (un worker per tipo, creato quando serve) ----
const motori = {};
let idSeq = 0;
const attese = new Map();
function motore(ep) {
  if (motori[ep]) return motori[ep];
  const w = new Worker(new URL(`./dettatura-worker.js?ep=${ep}`, import.meta.url), { type: 'module' });
  w.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === 'progresso') {
      stato.download = m.fase === 'avvio' ? { avvio: true } : { scaricati: m.scaricati, totale: m.totale, file: m.file, fonte: m.fonte };
      pubblicaRitardato();
      return;
    }
    const a = attese.get(m.id);
    if (!a) return;
    attese.delete(m.id);
    if (m.tipo === 'errore') {
      const e = new Error(m.messaggio);
      e.download = m.download;
      a.rifiuta(e);
    } else a.risolvi(m);
  };
  w.onerror = (e) => {
    for (const [id, a] of attese) if (a.ep === ep) (attese.delete(id), a.rifiuta(new Error(`motore della dettatura: ${e.message || 'errore'}`)));
    delete motori[ep];
  };
  motori[ep] = w;
  return w;
}
function chiedi(ep, msg, trasf) {
  const id = ++idSeq;
  const p = new Promise((risolvi, rifiuta) => {
    attese.set(id, { risolvi, rifiuta, ep });
    motore(ep).postMessage({ ...msg, id }, trasf || []);
  });
  p.id = id;
  return p;
}
// il motore inattivo da 5 minuti si chiude: il modello (250-600 MB in memoria) non resta caricato
let timerMotore = null;
function rimandaChiusura() {
  clearTimeout(timerMotore);
  timerMotore = setTimeout(() => {
    if (globalThis.dettaturaAttiva) return rimandaChiusura();
    for (const ep of Object.keys(motori)) {
      motori[ep].terminate();
      delete motori[ep];
    }
    stato.info = null;
  }, 5 * 60 * 1000);
}

let invioRinviato = null;
function pubblicaRitardato() {
  if (invioRinviato) return;
  invioRinviato = setTimeout(() => {
    invioRinviato = null;
    pubblica();
  }, 250);
}

const epDi = (id) => MODELLI_DETTATURA[modelloDettaturaValido(id)].ep;

async function caricaModello(id) {
  const mid = modelloDettaturaValido(id);
  stato.modello = mid;
  const r = await chiedi(epDi(mid), { tipo: 'carica', modello: mid });
  stato.info = r.info;
  stato.download = null;
  rimandaChiusura();
  return r.info;
}

// ---- microfono ----
let flusso = null;
let ctx = null;
let nodo = null;
let sorgente = null;

async function apriMicrofono() {
  flusso = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  ctx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule(new URL('./ascolto-worklet.js', import.meta.url));
  sorgente = ctx.createMediaStreamSource(flusso);
  nodo = new AudioWorkletNode(ctx, 'webg-raccoglitore');
  sorgente.connect(nodo);
  // il worklet deve essere collegato a un'uscita per girare: guadagno zero, niente suono
  const muto = ctx.createGain();
  muto.gain.value = 0;
  nodo.connect(muto).connect(ctx.destination);
  return nodo;
}

function chiudiMicrofono() {
  try {
    if (sorgente) sorgente.disconnect();
    if (nodo) nodo.disconnect();
  } catch {}
  if (flusso) for (const t of flusso.getTracks()) t.stop();
  if (ctx) ctx.close().catch(() => {});
  flusso = ctx = nodo = sorgente = null;
}

// ---- sessione di dettatura ----
let sessione = null;
let seqSessione = 0;

/** Prompt per Whisper: termini del dizionario e coda del testo gia' dettato (contesto). */
function prompt(S) {
  const termini = S.termini.length ? S.termini.join(', ') + '.' : '';
  const coda = S.precedente.split(/\s+/).slice(-20).join(' ');
  return { prompt: `${termini} ${coda}`.trim(), base: termini };
}

async function avvia({ modello, termini = [], motore: quale = 'whisper', t0 }) {
  if (sessione) return;
  const S = {
    id: ++seqSessione,
    t0: t0 || Date.now(),
    termini: Array.isArray(termini) ? termini.filter((t) => typeof t === 'string').slice(0, 60) : [],
    precedente: '',
    catena: Promise.resolve(),
    anticipata: null, // { promessa, valida }
  };
  sessione = S;
  globalThis.dettaturaAttiva = true;
  Object.assign(stato, { fase: 'preparazione', errore: null, motore: quale === 'webspeech' ? 'webspeech' : 'whisper', inCoda: 0 });
  pubblica();
  try {
    if (stato.motore === 'webspeech') {
      await avviaWebSpeech(S);
      return;
    }
    // il microfono si apre subito e ascolta mentre il modello si carica: i primi segmenti aspettano
    // il modello in coda, ma niente di quello che si dice va perso (serve al "premi per parlare")
    stato.modello = modelloDettaturaValido(modello);
    caricaModello(modello).catch((e) => {
      if (S === sessione) errore(e);
    });
    const w = await apriMicrofono();
    if (S !== sessione) return chiudiMicrofono();
    const seg = creaSegmentatore({
      inizio() {
        stato.fase = 'parlato';
        pubblica();
      },
      anticipo(audio, info) {
        S.anticipata = { promessa: trascrivi(S, audio, info), info };
      },
      ripresa() {
        // si e' ripreso a parlare: la trascrizione in anticipo non serve piu', si ferma
        annullaAnticipata(S);
      },
      fine(audio, info) {
        const a = S.anticipata;
        S.anticipata = null;
        const p = a && info.anticipato ? a.promessa : trascrivi(S, audio, info);
        consegna(S, p, info);
        stato.fase = 'ascolto';
        pubblica();
      },
      scarto() {
        annullaAnticipata(S);
        stato.fase = 'ascolto';
        pubblica();
      },
    });
    S.segmentatore = seg;
    let picco = 0;
    let ultimoLivello = 0;
    w.port.onmessage = (ev) => {
      if (S !== sessione) return;
      seg.aggiungi(ev.data);
      // livello per l'indicatore nella pagina, 8 volte al secondo
      let s = 0;
      for (let i = 0; i < ev.data.length; i++) s += ev.data[i] * ev.data[i];
      const db = 10 * Math.log10(s / ev.data.length + 1e-10);
      picco = Math.max(picco, Math.min(1, Math.max(0, (db + 60) / 45)));
      const ora = Date.now();
      if (ora - ultimoLivello > 120) {
        ultimoLivello = ora;
        pubblicaA({ tipo: 'livelloDettatura', v: +picco.toFixed(2) });
        picco = 0;
      }
    };
    stato.fase = 'ascolto';
    stato.prontaMs = Date.now() - S.t0;
    pubblica();
  } catch (e) {
    if (S === sessione) errore(e);
  }
}

function annullaAnticipata(S) {
  const a = S.anticipata;
  S.anticipata = null;
  if (a && a.promessa.id && motori[epDi(stato.modello)]) {
    motori[epDi(stato.modello)].postMessage({ tipo: 'annulla', quale: a.promessa.id });
    a.promessa.catch(() => {});
  }
}

/** Trascrizione di un segmento (in coda al motore, una alla volta). */
function trascrivi(S, audio, info) {
  stato.inCoda++;
  const t = Date.now();
  const pr = prompt(S);
  const p = chiedi(epDi(stato.modello), { tipo: 'trascrivi', audio, modello: stato.modello, prompt: pr.prompt, promptBase: pr.base }, [audio.buffer]);
  const fuori = p.then(
    (r) => {
      stato.inCoda--;
      return { ...r, msMotore: Date.now() - t };
    },
    (e) => {
      stato.inCoda--;
      throw e;
    }
  );
  fuori.id = p.id;
  return fuori;
}

/** Consegna in ordine: un segmento esce solo dopo il precedente. */
function consegna(S, promessa, info) {
  const fine = Date.now();
  S.catena = S.catena.then(async () => {
    let r;
    try {
      r = await promessa;
    } catch (e) {
      if (S === sessione) errore(e);
      return;
    }
    if (S !== sessione && !S.chiusura) return;
    // dalla fine del parlato (il VAD chiude il segmento 320-600 ms dopo) al testo pronto
    const latenza = Date.now() - (fine - info.silenzioMs);
    (stato.latenze ||= []).push({ ms: latenza, sec: +info.durata.toFixed(1) });
    if (stato.latenze.length > 20) stato.latenze.shift();
    stato.latenzaMs = stato.latenzaMs === null ? latenza : Math.round(stato.latenzaMs * 0.7 + latenza * 0.3);
    if (r.annullato) return;
    if (r.testo) S.precedente = (S.precedente + ' ' + r.testo).slice(-400);
    pubblicaA({
      tipo: 'dettato',
      sessione: S.id,
      testo: r.testo,
      pausa: info.pausa,
      probSilenzio: r.probSilenzio,
      logprob: r.logprobMedio,
      latenzaMs: latenza,
      msEncoder: r.msEncoder,
      msDecoder: r.msDecoder,
    });
    rimandaChiusura();
    pubblica();
  });
  return S.catena;
}

async function ferma() {
  const S = sessione;
  if (!S) return;
  S.chiusura = true;
  if (S.webspeech) {
    try {
      S.webspeech.stop();
    } catch {}
  }
  if (S.segmentatore) S.segmentatore.termina();
  chiudiMicrofono();
  sessione = null;
  globalThis.dettaturaAttiva = false;
  stato.fase = 'inattiva';
  pubblica();
  // i segmenti gia' in coda arrivano lo stesso, poi la pagina chiude la sessione
  await S.catena.catch(() => {});
  pubblicaA({ tipo: 'dettaturaFinita', sessione: S.id });
}

function errore(e) {
  console.error(e);
  const msg = String(e && e.message ? e.message : e);
  const S = sessione;
  sessione = null;
  globalThis.dettaturaAttiva = false;
  chiudiMicrofono();
  let testo = msg;
  if (/Permission|NotAllowed|denied/i.test(msg)) testo = 'Il microfono non è consentito: apri la pagina della dettatura dal pannello di WebG Voice e premi "Consenti il microfono".';
  else if (/NotFound|Requested device/i.test(msg)) testo = 'Non trovo un microfono collegato.';
  else if (e && e.download) testo = `Download del modello non riuscito: ${msg}. Controlla la connessione e riprova, riparte da dove si era fermato.`;
  Object.assign(stato, { fase: 'errore', errore: testo });
  pubblica();
  if (S) pubblicaA({ tipo: 'dettaturaFinita', sessione: S.id, errore: testo });
}

// ---- riserva: riconoscimento vocale di Chrome (Web Speech) ----
// Spenta di default. Se Chrome ha l'italiano sul dispositivo (processLocally) l'audio resta qui;
// altrimenti, solo se l'utente l'ha scelto nelle opzioni, l'audio va ai server di Google.
async function avviaWebSpeech(S) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR) throw new Error('Questo Chrome non ha il riconoscimento vocale.');
  const { dettRiserva } = await chrome.storage.local.get('dettRiserva');
  let locale = false;
  if (typeof SR.available === 'function') {
    try {
      locale = (await SR.available({ langs: ['it-IT'], processLocally: true })) === 'available';
    } catch {}
  }
  if (!locale && dettRiserva !== 'google') throw new Error('Il riconoscimento di Chrome sul dispositivo non è disponibile per l\'italiano: scegli WebG Voice nella pagina della dettatura oppure consenti l\'invio a Google.');
  const r = new SR();
  r.lang = 'it-IT';
  r.continuous = true;
  r.interimResults = false;
  if (locale) r.processLocally = true;
  let ultima = Date.now();
  r.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (!ev.results[i].isFinal) continue;
      const testo = ev.results[i][0].transcript.trim();
      const ora = Date.now();
      const pausa = (ora - ultima) / 1000;
      ultima = ora;
      if (testo) pubblicaA({ tipo: 'dettato', sessione: S.id, testo: testo[0].toUpperCase() + testo.slice(1) + '.', pausa: Math.min(pausa, 2), probSilenzio: 0, logprob: 0 });
    }
  };
  r.onerror = (ev) => {
    if (S === sessione && ev.error !== 'no-speech') errore(new Error(`riconoscimento di Chrome: ${ev.error}`));
  };
  r.onend = () => {
    // Chrome chiude da solo dopo un po' di silenzio: si riparte finche' la dettatura e' attiva
    if (S === sessione) {
      try {
        r.start();
      } catch {}
    }
  };
  S.webspeech = r;
  r.start();
  stato.fase = 'ascolto';
  stato.info = { motore: 'webspeech', locale };
  pubblica();
}

// ---- messaggi dal service worker ----
chrome.runtime.onMessage.addListener((msg, mittente, rispondi) => {
  if (mittente.id !== chrome.runtime.id || mittente.url !== URL_BACKGROUND) return;
  if (!msg || typeof msg !== 'object' || msg.a !== 'offscreen' || typeof msg.tipo !== 'string' || !msg.tipo.startsWith('dett')) return;
  (async () => {
    switch (msg.tipo) {
      case 'dettAvvia':
        avvia({ modello: msg.modello, termini: msg.termini, motore: msg.motore, t0: msg.t0 });
        return { stato };
      case 'dettFerma':
        await ferma();
        return { stato };
      case 'dettStato':
        return { stato, attiva: !!sessione };
      case 'dettPermesso': {
        let permesso = 'prompt';
        try {
          permesso = (await navigator.permissions.query({ name: 'microphone' })).state;
        } catch {}
        return { permesso };
      }
      case 'dettPronto': {
        // modello sul computer? (senza scaricare niente)
        const mid = modelloDettaturaValido(msg.modello);
        const r = await chiedi(epDi(mid), { tipo: 'statoCache', modello: mid });
        return { completo: r.completo, modello: mid };
      }
      case 'dettScarica':
        // scarica e carica il modello, poi lo misura: per la pagina di primo uso e le opzioni
        try {
          const giaPronto = stato.info && stato.info.modello === modelloDettaturaValido(msg.modello) && motori[epDi(msg.modello)];
          await caricaModello(msg.modello);
          // subito dopo il download il computer e' ancora occupato (archivio, memoria): si aspetta un attimo
          if (!giaPronto) await new Promise((r) => setTimeout(r, 3000));
          const m = await chiedi(epDi(msg.modello), { tipo: 'misura', modello: modelloDettaturaValido(msg.modello) });
          stato.ultimaMisura = m;
          stato.errore = null;
          pubblica();
          return { ok: true, misura: m, info: stato.info };
        } catch (e) {
          stato.download = stato.download ? { ...stato.download, interrotto: true } : null;
          stato.errore = String(e.message || e);
          pubblica();
          return { ok: false, errore: stato.errore };
        }
      case 'dettMisuraPC': {
        const out = {};
        for (const ep of ['wasm', 'webgpu']) {
          try {
            out[ep] = await chiedi(ep, { tipo: 'misuraPC' });
          } catch (e) {
            out[ep] = { disponibile: false, errore: String(e.message || e) };
          }
        }
        // il motore WebGPU della misura non serve piu'
        if (motori.webgpu && epDi(stato.modello || 'normale') !== 'webgpu') {
          motori.webgpu.terminate();
          delete motori.webgpu;
        }
        return out;
      }
      case 'dettCancella':
        await chiedi(epDi(msg.modello), { tipo: 'cancella', modello: modelloDettaturaValido(msg.modello) });
        return { ok: true };
      default:
        return { errore: 'comando sconosciuto' };
    }
  })().then(rispondi, (e) => rispondi({ errore: String(e.message || e) }));
  return true;
});
