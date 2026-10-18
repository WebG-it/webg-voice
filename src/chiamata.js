// Trascrizione di una call, lato offscreen document: audio della scheda (tabCapture) e microfono,
// ritaglio alle pause (lib/vad.js, uno per fonte), motore Parakeet (chiamata-worker.js) e
// trascrizione che cresce in memoria come solo testo. L'audio gia' trascritto si butta subito:
// in memoria restano al massimo i segmenti in coda (non oltre 5 minuti di audio).
//
// La scheda catturata da Chrome viene silenziata: qui la si rimanda all'uscita audio, cosi' la
// call si sente come prima. Niente esce dal computer.

import { creaSegmentatore } from './lib/vad.js';
import { creaTrascrizione, markdown, nomeFileChiamata, FONTE_IO, FONTE_CALL } from './lib/chiamata-testo.js';
import { byteChiamata } from './lib/modelli-chiamata.js';
import { valutaSegmento } from './lib/chiamata-filtro.js';

const URL_BACKGROUND = new URL('background.js', location.href).href;
const pubblicaA = (m) => chrome.runtime.sendMessage({ da: 'offscreen', ...m }).catch(() => {});

const CODA_MAX_SEC = 300; // oltre, i segmenti non entrano in coda (tratto segnato come non trascritto)
const BOZZA_OGNI_MS = 15000;
const MOTORE_INATTIVO_MS = 2 * 60 * 1000;
const ATTESA_CHIUSURA_MS = 90 * 1000; // alla fine, quanto aspettare il motore prima di consegnare comunque

const stato = {
  fase: 'inattiva', // inattiva | preparazione | attiva | chiusura | errore
  download: null, // { scaricati, totale, file }
  errore: null,
  inizio: null, // Date.now() dell'avvio
  righe: 0,
  inCoda: 0,
  codaSec: 0,
  lacune: 0,
  scartati: 0,
  senzaMicrofono: false,
  microfonoPerso: false,
  titolo: '',
};
globalThis.chiamataAttiva = false;

function pubblica() {
  pubblicaA({ tipo: 'statoChiamata', stato: { ...stato } });
}

// ---- motore (un worker, creato quando serve e chiuso dopo un po' di inattivita') ----
let worker = null;
let idSeq = 0;
const attese = new Map();
function motore() {
  if (worker) return worker;
  const w = new Worker(new URL('./chiamata-worker.js', import.meta.url), { type: 'module' });
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
    for (const [id, a] of attese) {
      attese.delete(id);
      a.rifiuta(new Error(`motore delle call: ${e.message || 'errore'}`));
    }
    worker = null;
  };
  worker = w;
  // @@test-inizio
  if (mappaProva) w.postMessage({ tipo: 'fontiProva', mappa: mappaProva, id: -1 });
  // @@test-fine
  return w;
}
// @@test-inizio
let mappaProva = null;
// @@test-fine
function chiedi(msg, trasf) {
  const id = ++idSeq;
  const p = new Promise((risolvi, rifiuta) => {
    attese.set(id, { risolvi, rifiuta });
    motore().postMessage({ ...msg, id }, trasf || []);
  });
  p.id = id;
  return p;
}
let timerMotore = null;
function rimandaChiusuraMotore() {
  clearTimeout(timerMotore);
  timerMotore = setTimeout(() => {
    if (globalThis.chiamataAttiva) return rimandaChiusuraMotore();
    if (worker) worker.terminate();
    worker = null;
  }, MOTORE_INATTIVO_MS);
}

let invioRinviato = null;
function pubblicaRitardato() {
  if (invioRinviato) return;
  invioRinviato = setTimeout(() => {
    invioRinviato = null;
    pubblica();
  }, 250);
}

// la lettura o la dettatura chiedono il processore: durante una call non si chiude niente da qui
async function caricaModello() {
  const r = await chiedi({ tipo: 'carica' });
  stato.download = null;
  rimandaChiusuraMotore();
  return r.info;
}

// ---- audio ----
const AUDIO_PAGINA = new URL('./ascolto-worklet.js', import.meta.url);

/** Una fonte: flusso -> contesto a 16 kHz -> blocchi da 20 ms -> segmentatore. */
async function creaFonte(S, nome, flusso, ctx) {
  const sorgente = ctx.createMediaStreamSource(flusso);
  const nodo = new AudioWorkletNode(ctx, 'webg-raccoglitore');
  sorgente.connect(nodo);
  // il worklet deve essere collegato a un'uscita per girare: guadagno zero, niente suono
  const muto = ctx.createGain();
  muto.gain.value = 0;
  nodo.connect(muto).connect(ctx.destination);
  const F = { nome, flusso, sorgente, nodo, muto, livello: 0, seg: null };
  F.seg = creaSegmentatore({
    fine(audio, info) {
      // orari sul tempo reale della call: la fine del parlato e' "adesso" meno il silenzio contato
      const fine = Date.now() - S.t0 - info.silenzioMs;
      const inizio = Math.max(0, fine - Math.max(0, info.durata * 1000 - 200));
      accoda(S, nome, audio, inizio, fine);
    },
  });
  nodo.port.onmessage = (ev) => {
    if (S !== sessione) return;
    F.seg.aggiungi(ev.data);
    let s = 0;
    for (let i = 0; i < ev.data.length; i++) s += ev.data[i] * ev.data[i];
    const db = 10 * Math.log10(s / ev.data.length + 1e-10);
    F.livello = Math.max(F.livello, Math.min(1, Math.max(0, (db + 60) / 45)));
  };
  return F;
}

function chiudiFonte(F) {
  if (!F) return;
  try {
    F.sorgente.disconnect();
    F.nodo.disconnect();
    F.nodo.port.onmessage = null;
  } catch {}
  for (const t of F.flusso.getTracks()) t.stop();
}

// ---- coda di trascrizione ----
function accoda(S, fonte, audio, inizio, fine) {
  if (S !== sessione) return;
  const sec = audio.length / 16000;
  if (S.codaSec + sec > CODA_MAX_SEC) {
    S.testo.lacuna(inizio, fine);
    stato.lacune++;
    return;
  }
  S.codaSec += sec;
  S.coda.push({ fonte, audio, sec, inizio, fine });
  stato.inCoda = S.coda.length + (S.inLavoro ? 1 : 0);
  stato.codaSec = Math.round(S.codaSec);
  pompa(S);
}

async function pompa(S) {
  if (S.inLavoro) return;
  S.inLavoro = true;
  try {
    while (S.coda.length) {
      const j = S.coda.shift();
      try {
        const r = await chiedi({ tipo: 'trascrivi', audio: j.audio }, [j.audio.buffer]);
        // @@test-inizio
        console.log('segmento', j.fonte, Math.round(j.inizio / 1000), Math.round(j.sec * 10) / 10, 's', JSON.stringify(r.testo));
        // @@test-fine
        if (r.testo && /\p{L}/u.test(r.testo)) {
          // rumore e voci sovrapposte: frammenti poco sicuri o inglesi inventati si scartano e si contano
          const v = valutaSegmento({ testo: r.testo, logprobMedio: r.logprobMedio, durata: j.sec });
          if (v.tieni) S.testo.aggiungi({ fonte: j.fonte, inizio: j.inizio, fine: j.fine, testo: r.testo });
          else stato.scartati++;
        }
        stato.righe = S.testo.righe;
        S.cambiata = true;
      } catch (e) {
        // un segmento che non si trascrive non ferma la call: si segna come tratto non trascritto
        S.testo.lacuna(j.inizio, j.fine);
        stato.lacune++;
        S.ultimoErrore = String((e && e.message) || e);
        if (S.ultimoErrore.includes('download') || e.download) throw e;
      } finally {
        S.codaSec = Math.max(0, S.codaSec - j.sec);
        stato.inCoda = S.coda.length;
        stato.codaSec = Math.round(S.codaSec);
      }
    }
  } catch (e) {
    if (S === sessione) errore(e);
  } finally {
    S.inLavoro = false;
    stato.inCoda = S.coda.length;
    S.fineCoda && S.fineCoda();
  }
}

// ---- sessione ----
let sessione = null;

async function flussoScheda(streamId) {
  // @@test-inizio
  if (streamId.startsWith('PROVA:')) {
    // solo test: l'audio della "scheda" e' un file, suonato in tempo reale
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await (await fetch(streamId.slice(6))).arrayBuffer());
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start();
    return dest.stream;
  }
  // @@test-fine
  return navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } });
}

async function avvia({ streamId, titolo, host, tabId, versione }) {
  // @@test-inizio
  console.log('avvia: id', String(streamId).length, 'sessione gia presente:', !!sessione, 'tempo', Date.now());
  // @@test-fine
  if (sessione) return;
  const S = {
    t0: Date.now(),
    titolo: String(titolo || '').slice(0, 300),
    host: String(host || '').slice(0, 200),
    versione: String(versione || '').slice(0, 20),
    tabId,
    testo: creaTrascrizione(),
    coda: [],
    codaSec: 0,
    inLavoro: false,
    cambiata: false,
    fonti: [],
  };
  sessione = S;
  globalThis.chiamataAttiva = true;
  Object.assign(stato, { fase: 'preparazione', errore: null, righe: 0, inCoda: 0, codaSec: 0, lacune: 0, scartati: 0, senzaMicrofono: false, microfonoPerso: false, titolo: S.titolo, inizio: S.t0 });
  pubblica();
  try {
    await caricaModello();
    if (S !== sessione) return;
    // scheda: il flusso resta valido pochi secondi dopo getMediaStreamId, per questo si apre per primo
    // @@test-inizio
    console.log('apro la scheda', Date.now());
    // @@test-fine
    const tab = await flussoScheda(streamId).catch((e) => {
      // @@test-inizio
      console.log('scheda: errore', e.name, e.message, Date.now());
      // @@test-fine
      throw e;
    });
    if (S !== sessione) {
      for (const t of tab.getTracks()) t.stop();
      return;
    }
    S.tab = tab;
    // la scheda catturata e' muta per l'utente: la si rimanda all'uscita audio
    S.ctxUscita = new AudioContext();
    S.uscita = S.ctxUscita.createMediaStreamSource(tab);
    S.uscita.connect(S.ctxUscita.destination);
    // microfono: se manca o e' bloccato si trascrive la sola call
    let mic = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      S.micFlusso = mic;
    } catch {
      stato.senzaMicrofono = true;
    }
    if (S !== sessione) {
      if (mic) for (const t of mic.getTracks()) t.stop();
      return;
    }
    S.ctx = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
    await S.ctx.audioWorklet.addModule(AUDIO_PAGINA);
    S.fonti.push(await creaFonte(S, FONTE_CALL, tab, S.ctx));
    if (mic) {
      S.fonti.push(await creaFonte(S, FONTE_IO, mic, S.ctx));
      const traccia = mic.getAudioTracks()[0];
      if (traccia)
        traccia.onended = () => {
          // microfono scollegato a meta' call: si continua con la sola scheda
          stato.microfonoPerso = true;
          const f = S.fonti.find((x) => x.nome === FONTE_IO);
          if (f) {
            f.seg.termina();
            chiudiFonte(f);
          }
          S.fonti = S.fonti.filter((x) => x.nome !== FONTE_IO);
          pubblica();
        };
    }
    const traccia = tab.getAudioTracks()[0];
    if (traccia) traccia.onended = () => S === sessione && ferma('scheda chiusa o catturata da altro');
    S.timerLivelli = setInterval(() => {
      if (S !== sessione) return clearInterval(S.timerLivelli);
      const liv = {};
      for (const f of S.fonti) {
        liv[f.nome] = +f.livello.toFixed(2);
        f.livello = 0;
      }
      pubblicaA({ tipo: 'livelloChiamata', liv });
    }, 250);
    S.timerBozza = setInterval(() => {
      if (S !== sessione) return clearInterval(S.timerBozza);
      salvaBozza(S);
      pubblica();
    }, BOZZA_OGNI_MS);
    if (S !== sessione) return;
    stato.fase = 'attiva';
    pubblica();
  } catch (e) {
    if (S === sessione) errore(e);
  }
}

function salvaBozza(S) {
  if (!S.cambiata) return;
  S.cambiata = false;
  pubblicaA({ tipo: 'bozzaChiamata', bozza: { titolo: S.titolo, host: S.host, inizio: S.t0, fine: Date.now(), ...S.testo.esporta() } });
}

function liberaAudio(S) {
  clearInterval(S.timerLivelli);
  clearInterval(S.timerBozza);
  for (const f of S.fonti) f.seg && f.seg.termina();
  for (const f of S.fonti) chiudiFonte(f);
  S.fonti = [];
  if (S.tab) for (const t of S.tab.getTracks()) t.stop();
  if (S.micFlusso) for (const t of S.micFlusso.getTracks()) t.stop();
  try {
    if (S.uscita) S.uscita.disconnect();
  } catch {}
  if (S.ctxUscita) S.ctxUscita.close().catch(() => {});
  if (S.ctx) S.ctx.close().catch(() => {});
}

function errore(e) {
  const S = sessione;
  stato.fase = 'errore';
  stato.errore = String((e && e.message) || e);
  if (S) {
    liberaAudio(S);
    // quello che c'e' si salva comunque
    if (S.testo.righe) consegna(S, true);
    else pubblicaA({ tipo: 'chiamataFinita', errore: stato.errore });
  }
  sessione = null;
  globalThis.chiamataAttiva = false;
  pubblica();
}

/** Fine ordinata: i segmenti in coda si finiscono di trascrivere, poi il file. */
async function ferma(motivo) {
  const S = sessione;
  if (!S || stato.fase === 'chiusura') return;
  const eraPreparazione = stato.fase === 'preparazione';
  stato.fase = 'chiusura';
  pubblica();
  liberaAudio(S);
  if (eraPreparazione) {
    sessione = null;
    globalThis.chiamataAttiva = false;
    Object.assign(stato, { fase: 'inattiva', download: null });
    pubblicaA({ tipo: 'chiamataFinita', errore: 'annullata' });
    pubblica();
    return;
  }
  // i segmenti chiusi da termina() sono gia' in coda: si aspetta che il motore li finisca
  try {
    if (S.inLavoro || S.coda.length) {
      let tetto;
      await Promise.race([new Promise((ok) => (S.fineCoda = ok)), new Promise((ok) => (tetto = setTimeout(ok, ATTESA_CHIUSURA_MS)))]);
      clearTimeout(tetto);
      // scaduto il tempo: i segmenti rimasti in coda si segnano come tratti non trascritti
      for (const j of S.coda.splice(0)) {
        S.testo.lacuna(j.inizio, j.fine);
        stato.lacune++;
      }
    }
    await consegna(S, false, motivo);
  } catch (e) {
    console.error('chiusura della trascrizione', e);
    stato.errore = String((e && e.message) || e);
    // quello che c'e' si consegna comunque, in forma semplice
    pubblicaA({ tipo: 'chiamataFinita', errore: stato.errore });
  }
  sessione = null;
  globalThis.chiamataAttiva = false;
  Object.assign(stato, { fase: 'inattiva', download: null });
  rimandaChiusuraMotore();
  pubblica();
}

async function consegna(S, daErrore, motivo) {
  if (S.consegnata) return;
  S.consegnata = true;
  const fine = new Date();
  const testo = markdown({
    trascrizione: S.testo,
    titolo: S.titolo,
    host: S.host,
    inizio: new Date(S.t0),
    fine,
    versione: S.versione,
    senzaMicrofono: stato.senzaMicrofono,
    microfonoPerso: stato.microfonoPerso,
    scartati: stato.scartati,
    finePrematura: /barretta-persa/.test(motivo || '')
      ? 'la barretta non poteva restare nella pagina (la call è passata a un altro sito?)'
      : /scheda chiusa/.test(motivo || '')
        ? 'la scheda è stata chiusa o catturata da altro'
        : '',
  });
  pubblicaA({ tipo: 'chiamataFinita', testo, nomeFile: nomeFileChiamata(S.titolo, new Date(S.t0)), righe: S.testo.righe, lacune: stato.lacune, motivo: motivo || null, errore: daErrore ? stato.errore : null });
}

// ---- messaggi dal service worker ----
chrome.runtime.onMessage.addListener((msg, mittente, rispondi) => {
  if (mittente.id !== chrome.runtime.id || mittente.url !== URL_BACKGROUND) return;
  if (!msg || typeof msg !== 'object' || msg.a !== 'offscreen' || typeof msg.tipo !== 'string' || !msg.tipo.startsWith('chiam')) return;
  (async () => {
    switch (msg.tipo) {
      case 'chiamAvvia':
        if (typeof msg.streamId !== 'string' || msg.streamId.length > 500) return { errore: 'flusso non valido' };
        // si risponde a flusso aperto (pochi secondi): se la cattura fallisce, chi ha chiesto lo sa subito
        await avvia({ streamId: msg.streamId, titolo: msg.titolo, host: msg.host, tabId: msg.tabId, versione: msg.versione });
        // fermata durante la preparazione: niente e' partito
        if (!sessione && stato.fase !== 'errore') return { stato, errore: 'annullata' };
        return { stato, errore: stato.fase === 'errore' ? stato.errore || 'errore' : undefined };
      case 'chiamFerma':
        await ferma(msg.motivo);
        return { stato };
      case 'chiamStato':
        return { stato, attiva: !!sessione };
      case 'chiamMicrofono': {
        let permesso = 'prompt';
        try {
          permesso = (await navigator.permissions.query({ name: 'microphone' })).state;
        } catch {}
        return { permesso };
      }
      case 'chiamPronto': {
        const r = await chiedi({ tipo: 'statoCache' });
        return { completo: r.completo, byte: byteChiamata };
      }
      case 'chiamPrepara':
        // scarica (se serve) e carica il modello in memoria, senza aprire niente: il flusso della
        // scheda si chiede solo dopo, perche' dura pochi secondi
        try {
          globalThis.chiamataAttiva = true;
          Object.assign(stato, { fase: 'preparazione', errore: null, download: null });
          pubblica();
          await caricaModello();
          return { ok: true };
        } catch (e) {
          stato.errore = String((e && e.message) || e);
          return { ok: false, errore: stato.errore };
        } finally {
          if (!sessione) {
            globalThis.chiamataAttiva = false;
            Object.assign(stato, { fase: stato.errore ? 'errore' : 'inattiva', download: null });
            pubblica();
          }
        }
      case 'chiamCancella':
        await chiedi({ tipo: 'cancella' });
        return { ok: true };
      // @@test-inizio
      case 'chiamFontiProva':
        mappaProva = msg.mappa;
        await chiedi({ tipo: 'fontiProva', mappa: msg.mappa });
        return { ok: true };
      // @@test-fine
      default:
        return { errore: 'comando sconosciuto' };
    }
  })().then(rispondi, (e) => rispondi({ errore: String((e && e.message) || e) }));
  return true;
});
