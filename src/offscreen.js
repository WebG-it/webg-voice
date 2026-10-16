// Offscreen document: tiene il motore (Web Worker) e l'audio, cosi' la lettura
// continua anche a popup chiuso. E' la sola fonte di verita' sullo stato: lo
// pubblica a ogni cambio e il service worker lo gira alla barretta della scheda.
// Qui gira anche la creazione degli MP3, che usa lo stesso motore ma cede il
// passo alla lettura: il modello resta caricato una volta sola.

import { FREQUENZA, wav } from './lib/audio.js';
import { impronta } from './lib/impronta.js';
import { dividiSezioni, componiBlocco, pianoIniziale, regolaBlocco } from './lib/testo.js';
import { VOCI, voceValida } from './lib/modelli.js';
import { KBPS, nomeFile, tagId3 } from './lib/mp3.js';
import { daLiberare } from './lib/riposo.js';

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
  fase: 'inattivo', // inattivo | preparazione | lettura | pausa | consenso
  velocita: 1,
  voce: 'sara',
  blocco: 0,
  totale: 0,
  tabId: null,
  titolo: null, // titolo dell'articolo in lettura, se e' un articolo
  download: null,
  downloadVoce: null, // download di una voce in piu' (Nicola): { voce, scaricati, totale }
  motorePronto: false,
  info: null,
  errore: null,
  metriche: {},
  mp3: null, // creazione dell'MP3: vedi creaMp3()
  versione: null, // l'offscreen document non ha chrome.runtime.getManifest: si legge sotto
};

// Riposo: il motore caricato occupa circa 0,9-1,2 GB, e ricaricarlo costa circa 1,5 secondi
// in piu' sulla prima lettura (partenza a freddo). Si tiene pronto 30 minuti dall'ultimo uso
// finche' Chrome e' in uso (il service worker segnala cambi di scheda, finestra e pagina), e
// lo si libera dopo 10 minuti se in Chrome non succede niente o se l'utente ha spento
// "tieni la voce pronta". Mai mentre si crea un MP3, ne' finche' un MP3 pronto non e' salvato
// (al massimo 30 minuti).
const MP3_TENUTO_MS = 30 * 60 * 1000;
let ultimoUso = Date.now();
let ultimaAttivita = Date.now();
let tienePronta = true;
let timerRiposo = null;
function controllaRiposo() {
  if (stato.fase !== 'inattivo' || caricamento || lavoroMp3) ultimoUso = Date.now();
  if (timerRiposo) return;
  timerRiposo = setInterval(() => {
    if (stato.fase !== 'inattivo' || caricamento || lavoroMp3) {
      ultimoUso = Date.now();
      return;
    }
    const m = stato.mp3;
    if (m && m.fase === 'pronto' && !m.salvato && Date.now() - m.quando < MP3_TENUTO_MS) return;
    // non durante la dettatura (ascolto.js, nello stesso documento): chiuderlo la fermerebbe
    if (globalThis.dettaturaAttiva) {
      ultimoUso = Date.now();
      return;
    }
    const libera = daLiberare({ fermoMs: Date.now() - ultimoUso, chromeFermoMs: Date.now() - ultimaAttivita, tienePronta });
    if (libera) chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'riposo' }).catch(() => {});
  }, 30 * 1000);
}

// Dettatura (ascolto.js) su un computer con poca memoria: la voce pronta (circa 1 GB) si libera,
// cosi' il modello della dettatura ha spazio. Non durante una lettura o un MP3.
globalThis.webgLiberaVoce = async () => {
  if (!stato.motorePronto || stato.fase !== 'inattivo' || lavoroMp3 || caricamento) return false;
  await chiedi({ tipo: 'libera' });
  stato.motorePronto = false;
  pubblica();
  return true;
};

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
    if (stato.fase !== 'inattivo') ultimoUso = Date.now();
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
  if (m.voce && m.file && m.file !== 'voce' && m.file !== 'modello') {
    // voce in piu': mezzo MB, non e' il "primo download" del modello
    stato.downloadVoce = m.fase === 'download' ? { voce: m.voce, scaricati: m.scaricati, totale: m.totale } : null;
    pubblica(false);
    return;
  }
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
  stato.downloadVoce = null;
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
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: FREQUENZA, latencyHint: 'playback' });
    // La pausa la decide solo l'utente (pulsante, pannello, scorciatoia): se il browser sospende
    // l'audio durante una lettura in corso (cambio di scheda, dispositivo audio, risparmio
    // energetico) lo si riprende subito, e la lettura continua.
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && ctx.state !== 'closed' && lettura && stato.fase === 'lettura') {
        stato.metriche.audioRipreso = (stato.metriche.audioRipreso || 0) + 1;
        ctx.resume().catch(() => {});
      }
    });
  }
  return ctx;
}

// Caricamento del motore. Se manca il modello lo scarica; se il download si
// interrompe riprova da solo con attese crescenti (riprende dai pezzi gia' salvati),
// poi si arrende e mostra "Riprova".
const ATTESE_AUTO = [5, 15, 45]; // secondi
let caricamento = null;
function motore() {
  if (stato.motorePronto) return Promise.resolve();
  caricamento ??= (async () => {
    for (let t = 0; ; t++) {
      try {
        const r = await chiedi({ tipo: 'avvia' });
        stato.motorePronto = true;
        stato.info = r.info;
        stato.download = null;
        pubblica();
        return;
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (!/download/i.test(msg) || t >= ATTESE_AUTO.length) throw e;
        stato.download = { ...(stato.download || {}), riprovoTra: ATTESE_AUTO[t], dettaglio: msg };
        pubblica();
        await new Promise((r) => setTimeout(r, ATTESE_AUTO[t] * 1000));
        if (stato.download) stato.download.riprovoTra = undefined;
      }
    }
  })().finally(() => {
    caricamento = null;
  });
  return caricamento;
}

// Il modello (circa 330 MB) si scarica da solo: all'installazione, all'avvio del
// browser se manca, o alla prima lettura. Unica eccezione la connessione a
// consumo: li' serve un clic esplicito (dal popup o dalla barretta).
const aConsumo = () => {
  const c = navigator.connection;
  return !!(c && (c.saveData || c.type === 'cellular'));
};
let consenso = false;
let richiestaInAttesa = null;

async function modelloCompleto() {
  if (stato.motorePronto) return true;
  const c = await chiedi({ tipo: 'statoCache' });
  return { completo: Object.values(c.completi).every(Boolean), c };
}

/** true se serve il clic dell'utente prima di scaricare (solo a consumo). */
async function serveConsenso() {
  if (stato.motorePronto || consenso || caricamento || !aConsumo()) return false;
  const r = await modelloCompleto();
  if (r === true || r.completo) return false;
  stato.download = { scaricati: r.c.scaricati, totale: r.c.totale, inAttesa: true };
  stato.consumo = true;
  return true;
}

/** Download in sottofondo, senza lettura (installazione, avvio del browser). */
async function scaricaInSottofondo() {
  if (stato.motorePronto || caricamento) return;
  if (await serveConsenso()) {
    pubblica();
    return;
  }
  motore().catch(errore);
}

function consenti() {
  consenso = true;
  const r = richiestaInAttesa;
  richiestaInAttesa = null;
  if (r) leggi(r);
  else {
    stato.errore = null;
    if (stato.download) stato.download = { ...stato.download, interrotto: false, inAttesa: false };
    pubblica();
    motore().catch(errore);
  }
}

/**
 * Pannello aperto: se il modello e' gia' sul computer il motore si carica subito, cosi'
 * la lettura che probabilmente segue non paga i 2-3 secondi del caricamento.
 * Non scarica niente: se il modello manca non fa nulla.
 */
async function preriscalda() {
  if (stato.motorePronto || caricamento) return;
  try {
    const r = await modelloCompleto();
    if (r === true || r.completo) motore().catch(() => {});
  } catch {}
}

/** Scarica in anticipo lo stile di una voce scelta (Nicola), cosi' la lettura parte subito. */
async function preparaVoce(v) {
  try {
    await chiedi({ tipo: 'preparaVoce', voce: v });
    stato.downloadVoce = null;
    if (stato.errore && /voce/i.test(stato.errore)) stato.errore = null;
  } catch (e) {
    stato.downloadVoce = null;
    if (stato.fase === 'inattivo') stato.errore = String(e && e.message ? e.message : e);
  }
  pubblica();
}

// Autoregolazione: rapporto col tempo reale misurato sui blocchi delle letture
// vere (media mobile, peso 0,3 all'ultimo blocco), salvato in storage ogni pochi
// blocchi. Decide blocchi piu' corti, quanti blocchi preparare in anticipo e se
// partire dopo due blocchi. Senza misure si parte prudenti (come un PC lento).
const RTF_PRUDENTE = 0.9;
let rtf = null;
let blocchiDaSalvare = 0;
let aggiornaRtfOriginale = null;
// eslint-disable-next-line prefer-const
let aggiornaRtf = function (v) {
  if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v > 20) return;
  rtf = rtf === null ? v : rtf * 0.7 + v * 0.3;
  stato.rtf = +rtf.toFixed(2);
  if (++blocchiDaSalvare >= 3) salvaRtf();
};
function salvaRtf() {
  blocchiDaSalvare = 0;
  if (rtf !== null) chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'rtf', valore: +rtf.toFixed(3) }).catch(() => {});
}
const rtfUsato = () => (rtf === null ? RTF_PRUDENTE : rtf);

// Costo della sintesi misurato sul posto: millisecondi = fisso + perFonema x fonemi.
// Serve a decidere quanto testo mettere nel prossimo blocco perche' sia pronto prima
// che finisca l'audio gia' in coda. Si aggiorna a ogni blocco e vale fra una lettura e
// l'altra finche' il motore resta caricato.
const costo = { punti: [], audioPerFonema: null };
function stimaCosto() {
  const P = costo.punti;
  let fisso = 500;
  let perFonema = null;
  if (P.length >= 4) {
    const mx = P.reduce((s, p) => s + p[0], 0) / P.length;
    const my = P.reduce((s, p) => s + p[1], 0) / P.length;
    const sxx = P.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    if (sxx > 40 * 40 * P.length * 0.25) {
      const pend = P.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
      const inter = my - pend * mx;
      if (pend > 2 && inter >= 0 && inter < 3000) {
        perFonema = pend;
        fisso = inter;
      }
    }
  }
  if (perFonema === null && P.length) perFonema = Math.max(2, P.reduce((s, p) => s + Math.max(0, p[1] - fisso) / p[0], 0) / P.length);
  // senza misure: dal rapporto col tempo reale salvato (o prudente)
  // stima di partenza dal rapporto salvato, limitata: un valore gonfiato da un momento di carico
  // del PC non deve condizionare le letture dopo (dal primo blocco valgono le misure vere)
  if (perFonema === null) perFonema = Math.min(1.1, Math.max(0.5, rtfUsato())) * 46;
  const audio = costo.audioPerFonema || 46 / (stato.velocita || 1);
  return { fisso, perFonema: perFonema * 1.1, audio };
}
function misuraCosto(n, ms, secAudio, pausa) {
  if (!(n > 0 && ms > 0)) return;
  costo.punti.push([n, ms]);
  if (costo.punti.length > 8) costo.punti.shift(); // ultimi 8 blocchi: segue i cambi di carico del PC
  const a = ((secAudio - (pausa || 0)) * 1000) / n;
  if (a > 10 && a < 200) costo.audioPerFonema = costo.audioPerFonema ? costo.audioPerFonema * 0.7 + a * 0.3 : a;
}
// Primo blocco: lo sceglie pianoIniziale (lib/testo.js) simulando l'inizio con il costo
// misurato; i successivi stanno nell'85% dell'audio gia' pronto davanti (limiteDaMargine).
// oltre questo anticipo (secondi di audio pronto) la sintesi si ferma e aspetta
const ANTICIPO_S = 45;

let lettura = null;
let ultimaLettura = null;
let seq = 0;
// @@test-inizio
let registra = false; // solo test: tiene l'audio di tutta la lettura (in produzione mai)
// @@test-fine

function sveglia(L) {
  const s = L.sveglia;
  L.sveglia = null;
  if (s) s();
}
function attendi(L, motivo) {
  L.inAttesa = motivo;
  return new Promise((r) => {
    L.sveglia = () => {
      L.inAttesa = null;
      r();
    };
  });
}

/**
 * Lettura. Il testo si prepara in pezzi (frasi e incisi): la prima sezione subito, le
 * altre mentre la lettura e' partita. I blocchi si compongono mentre si legge: il primo
 * corto per partire presto, poi frasi intere quante ne permette l'audio gia' pronto.
 * L'audio gia' suonato non resta in memoria.
 */
async function leggi({ testo, velocita, tabId, t0, rtf: rtfSalvato, dizionario, voce, titolo, bozza = false }) {
  ferma(false);
  if (rtf === null && typeof rtfSalvato === 'number') aggiornaRtf(rtfSalvato);
  if (voce) stato.voce = voceValida(voce);
  if (await serveConsenso()) {
    richiestaInAttesa = { testo, velocita, tabId, rtf: rtfSalvato, dizionario, voce, titolo, bozza };
    Object.assign(stato, { fase: 'consenso', tabId: tabId ?? null, errore: null, blocco: 0, totale: 0 });
    pubblica();
    return;
  }
  const L = {
    id: ++seq,
    t0: t0 || Date.now(),
    pezzi: [],
    cursore: 0, // primo pezzo non ancora sintetizzato
    blocchi: [], // blocchi gia' sintetizzati: { da, a } in pezzi
    sorgenti: [],
    finePrevista: 0,
    generazione: 0,
    voce: stato.voce,
    dizionario,
    daPreparare: null,
    preparato: false,
    registrazione: [],
    richiesta: { testo, velocita, tabId, rtf: rtfSalvato, dizionario, voce, titolo, bozza },
    bozza, // "Rileggi la bozza": una frase per blocco e pause piu' lunghe fra le frasi
  };
  L.tabId = tabId ?? null;
  lettura = ultimaLettura = L;
  if (typeof velocita === 'number') stato.velocita = velocita;
  Object.assign(stato, { fase: 'preparazione', tabId: tabId ?? null, errore: null, blocco: 0, totale: 0, impronta: impronta(testo), titolo: titolo || null });
  stato.metriche = { secondiAudio: 0, fonemi: [] };
  pubblica();
  try {
    const c = contesto();
    if (c.state !== 'running') await c.resume();
    await motore();
    if (L !== lettura) return;
    const sezioni = dividiSezioni(testo);
    L.parametri = { costo: stimaCosto(), sezioni: sezioni.length };
    const r = await chiedi({ tipo: 'prepara', testo: sezioni[0] || '', sessione: L.id, opzioni: { pezzi: true, dizionario } });
    if (L !== lettura) return;
    L.pezzi = r.pezzi;
    L.daPreparare = sezioni.slice(1);
    L.preparato = !L.daPreparare.length;
    stato.totale = L.pezzi.length;
    stato.metriche.preparazioneMs = r.ms;
    if (!L.pezzi.length && L.preparato) {
      lettura = null;
      Object.assign(stato, { fase: 'inattivo', errore: 'Nel testo non c\'e\' niente da leggere.' });
      pubblica();
      return;
    }
    pompa(L);
    seguiFrase(L);
  } catch (e) {
    if (L === lettura && !(e instanceof Annullato)) errore(e);
  }
}

/** Prepara le sezioni dopo la prima, una alla volta, mentre la lettura e' gia' partita. */
function avviaResto(L) {
  if (L.restoAvviato || L.preparato) return;
  L.restoAvviato = true;
  (async () => {
    const sezioni = L.daPreparare;
    for (let k = 0; k < sezioni.length; k++) {
      const r = await chiedi({ tipo: 'prepara', testo: sezioni[k], sessione: L.id, opzioni: { pezzi: true, dizionario: L.dizionario } });
      if (L !== lettura) return;
      L.pezzi.push(...r.pezzi);
      stato.totale = L.pezzi.length;
      stato.metriche.preparazioneMs += r.ms;
      sveglia(L);
      pubblica(false);
    }
    L.daPreparare = null;
    L.preparato = true;
    sveglia(L);
    forseFinita(L);
  })().catch((e) => {
    if (L === lettura && !(e instanceof Annullato)) errore(e);
  });
}

function forseFinita(L) {
  if (L !== lettura || !L.preparato || L.cursore < L.pezzi.length || L.sorgenti.length) return false;
  lettura = null;
  stato.fase = 'inattivo';
  if (!L.partito) stato.errore = 'Nel testo non c\'e\' niente da leggere.';
  salvaRtf();
  pubblica();
  return true;
}

// Sintetizza un blocco dopo l'altro finche' davanti c'e' meno di ANTICIPO_S di audio pronto
async function pompa(L) {
  if (L.pompaAttiva) return;
  L.pompaAttiva = true;
  try {
    while (L === lettura) {
      if (L.cursore >= L.pezzi.length) {
        if (L.preparato) break;
        avviaResto(L);
        await attendi(L, 'resto');
        continue;
      }
      const c = contesto();
      const margine = L.partito ? Math.max(0, L.finePrevista - c.currentTime) : 0;
      if (L.partito && margine >= ANTICIPO_S) {
        await attendi(L, 'anticipo');
        continue;
      }
      const primo = !L.partito;
      const k = stimaCosto();
      let limite;
      if (primo) {
        const piano = pianoIniziale(L.pezzi, k);
        L.parametri.piano = piano;
        limite = piano.limite;
      } else limite = regolaBlocco(margine, k);
      const b = componiBlocco(L.pezzi, L.cursore, limite, { primo, fineTesto: L.preparato, unaFrase: L.bozza, pausaFrase: L.bozza ? PAUSA_BOZZA : 0 });
      if (b.dividi) {
        L.pezzi.splice(L.cursore, 1, ...b.dividi);
        stato.totale = L.pezzi.length;
      }
      const gen = L.generazione;
      const da = L.cursore;
      const r = await chiedi({ tipo: 'sintetizza', fonemi: b.fonemi, velocita: stato.velocita, voce: L.voce, pausa: b.pausa, sessione: L.id });
      if (L !== lettura) return;
      const n = [...b.fonemi].length;
      (stato.metriche.sintesiMs ||= []).push(r.ms);
      stato.metriche.fonemi.push(n);
      misuraCosto(n, r.ms, r.audio.length / FREQUENZA, b.pausa);
      aggiornaRtf(r.rtf);
      if (gen !== L.generazione) continue; // velocita' o voce cambiate nel frattempo
      // testo scritto delle frasi del blocco, per evidenziarle nella pagina mentre suonano
      L.blocchi.push({ da, a: b.a, testo: L.pezzi.slice(da, b.a).map((p) => p.testo).filter(Boolean).join(' ') });
      L.cursore = b.a;
      programma(L, L.blocchi.length - 1, r.audio);
      L.partito = true;
      // le sezioni successive si preparano solo dopo il primo suono, per non ritardarlo
      avviaResto(L);
    }
  } catch (e) {
    if (L === lettura && !(e instanceof Annullato)) errore(e);
  } finally {
    L.pompaAttiva = false;
  }
}

// Pausa in piu' fra le frasi in "Rileggi la bozza" (secondi)
const PAUSA_BOZZA = 0.35;

// Frase in corso: ogni 150 ms si guarda quale blocco sta suonando (il tempo dell'audio si ferma
// in pausa, quindi l'evidenziazione resta giusta) e, se cambia, lo si dice alla scheda.
let timerFrase = null;
function seguiFrase(L) {
  if (timerFrase || L.tabId === null || L.tabId === undefined) return;
  L.evidenziato = -1;
  L.primaInviata = false;
  timerFrase = setInterval(() => {
    if (L !== lettura) {
      clearInterval(timerFrase);
      timerFrase = null;
      if (L.evidenziato >= 0) chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'evidenzia', tabId: L.tabId, testo: null }).catch(() => {});
      return;
    }
    const t = contesto().currentTime;
    const v = L.sorgenti.find((x) => x.inizio <= t + 0.02 && t < x.fine);
    if (!v || (v.indice === L.evidenziato && !L.riallinea)) return;
    L.evidenziato = v.indice;
    let b = L.blocchi[v.indice];
    if (L.riallinea) {
      // la scheda torna visibile: si rimanda la frase in corso, anche a meta' (blocco senza testo)
      L.riallinea = false;
      for (let i = v.indice; i >= 0 && !(b && b.testo); i--) b = L.blocchi[i];
    }
    if (!b || !b.testo) return; // il resto di una frase gia' evidenziata
    // "nuova": la prima frase di questa lettura, la pagina riparte dalla selezione o dall'inizio
    const nuova = !L.primaInviata;
    L.primaInviata = true;
    const articolo = !!(L.richiesta && L.richiesta.titolo);
    chrome.runtime.sendMessage({ da: 'offscreen', tipo: 'evidenzia', tabId: L.tabId, testo: b.testo.slice(0, 4000), nuova, articolo }).catch(() => {});
  }, 150);
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
  stato.metriche.secondiAudio = +(stato.metriche.secondiAudio + buf.duration).toFixed(2);
  // @@test-inizio
  if (registra) L.registrazione[i] = audio;
  // @@test-fine
  if (i === 0 && stato.metriche.primoSuonoMs === undefined) {
    stato.metriche.primoSuonoMs = Math.round(Date.now() - L.t0 + (inizio - c.currentTime) * 1000);
  }
  if (stato.fase === 'preparazione') stato.fase = 'lettura';
  src.onended = () => {
    src.disconnect();
    if (L !== lettura) return;
    L.sorgenti = L.sorgenti.filter((s) => s !== v);
    const b = L.blocchi[i];
    if (b) stato.blocco = Math.max(stato.blocco, Math.min(b.a, L.pezzi.length));
    if (forseFinita(L)) return;
    sveglia(L);
    pubblica();
  };
  pubblica();
}

function ferma(pubblicare = true) {
  const L = lettura;
  if (L) {
    if (blocchiDaSalvare) salvaRtf();
    worker.postMessage({ tipo: 'annulla', sessione: L.id });
    for (const s of L.sorgenti) {
      s.src.onended = null;
      try {
        s.src.stop();
        s.src.disconnect();
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

/** I blocchi gia' pronti ma non ancora partiti si rifanno (nuova velocita' o nuova voce). */
function rifaiNonPartiti(L) {
  L.generazione++;
  const c = contesto();
  const tenute = [];
  let primoScartato = Infinity;
  for (const s of L.sorgenti) {
    if (s.inizio > c.currentTime + 0.05) {
      s.src.onended = null;
      try {
        s.src.stop();
        s.src.disconnect();
      } catch {}
      primoScartato = Math.min(primoScartato, s.indice);
    } else tenute.push(s);
  }
  L.sorgenti = tenute;
  if (primoScartato < L.blocchi.length) {
    L.cursore = L.blocchi[primoScartato].da;
    L.blocchi.length = primoScartato;
  }
  L.finePrevista = tenute.length ? Math.max(...tenute.map((s) => s.fine)) : 0;
  sveglia(L);
  pompa(L);
}

function impostaVelocita(v) {
  const vel = Math.min(1.5, Math.max(0.7, Number(v) || 1));
  if (vel === stato.velocita) return;
  stato.velocita = vel;
  if (lettura) rifaiNonPartiti(lettura);
  pubblica();
}

function impostaVoce(v) {
  const id = voceValida(v);
  if (id !== stato.voce) {
    stato.voce = id;
    const L = lettura;
    if (L) {
      L.voce = id;
      rifaiNonPartiti(L);
    }
  }
  if (id !== 'sara') preparaVoce(id);
  else pubblica();
}

// ---- MP3: sintesi di tutto il testo e codifica, in locale ----
// Un blocco alla volta: prima di chiedere il successivo al motore si aspetta che
// una lettura in corso abbia almeno 20 secondi di audio pronto, cosi' l'MP3 non la
// fa mai fermare. Blocchi da al massimo 90 fonemi (circa 4 secondi di voce): un blocco gia'
// in sintesi non si puo' interrompere, e una lettura chiesta intanto aspetta al massimo quello.
const MP3_BLOCCO_MAX = 90;
let lavoroMp3 = null;
let codificatore = null;
let urlMp3 = null;

function avviaCodificatore() {
  if (codificatore) return codificatore;
  const w = new Worker(new URL('./mp3-worker.js', import.meta.url));
  const att = new Map();
  w.onmessage = (ev) => {
    const m = ev.data;
    const a = att.get(m.id);
    if (!a) return;
    att.delete(m.id);
    if (m.tipo === 'errore') a.rifiuta(new Error(`codifica MP3: ${m.messaggio}`));
    else a.risolvi(m);
  };
  w.onerror = (e) => {
    for (const a of att.values()) a.rifiuta(new Error(`codifica MP3: ${e.message || 'errore'}`));
    att.clear();
  };
  let n = 0;
  codificatore = {
    chiedi: (msg) =>
      new Promise((risolvi, rifiuta) => {
        const id = ++n;
        att.set(id, { risolvi, rifiuta });
        w.postMessage({ ...msg, id });
      }),
    manda: (msg, trasf) => w.postMessage(msg, trasf || []),
    chiudi: () => {
      w.terminate();
      for (const a of att.values()) a.rifiuta(new Annullato());
      att.clear();
      codificatore = null;
    },
  };
  return codificatore;
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attende finche' una lettura in corso ha bisogno del motore. */
async function cediAllaLettura(J) {
  for (;;) {
    if (J !== lavoroMp3) throw new Annullato();
    const L = lettura;
    // la lettura ha la precedenza finche' ha meno di 20 secondi di audio pronto davanti
    const margine = L && ctx ? L.finePrevista - ctx.currentTime : 0;
    const serve = L && L.pompaAttiva && L.inAttesa !== 'anticipo' && stato.fase !== 'pausa' && !(L.partito && margine >= 20);
    // durante la dettatura il processore serve a Whisper: l'MP3 aspetta
    if (!serve && !globalThis.dettaturaAttiva) return;
    await dorme(150);
  }
}

function liberaMp3() {
  if (urlMp3) URL.revokeObjectURL(urlMp3);
  urlMp3 = null;
}

async function creaMp3({ testo, titolo, velocita, voce, dizionario }) {
  annullaMp3(false);
  liberaMp3();
  const J = { id: ++seq, t0: Date.now() };
  lavoroMp3 = J;
  const v = voceValida(voce || stato.voce);
  const vel = Math.min(1.5, Math.max(0.7, Number(velocita) || 1));
  const nome = nomeFile(titolo, testo);
  stato.mp3 = { fase: 'preparazione', fatti: 0, totale: 0, secondi: 0, nomeFile: nome, titolo: titolo || null, voce: v };
  stato.errore = null;
  pubblica();
  try {
    if (!stato.motorePronto && aConsumo() && !consenso) {
      const r = await modelloCompleto();
      if (r !== true && !r.completo) throw new Error('Prima serve la voce sul computer: premi Scarica nel pannello, poi riprova.');
    }
    await motore();
    const enc = avviaCodificatore();
    await enc.chiedi({ tipo: 'inizia', frequenza: FREQUENZA, kbps: KBPS });
    // preparazione di tutte le sezioni (pochi millisecondi l'una), cosi' il totale e' noto
    const sezioni = dividiSezioni(testo);
    const blocchi = [];
    for (let k = 0; k < sezioni.length; k++) {
      await cediAllaLettura(J);
      const r = await chiedi({
        tipo: 'prepara',
        testo: sezioni[k],
        sessione: J.id,
        opzioni: { dizionario, limiteIniziale: MP3_BLOCCO_MAX, bloccoMax: MP3_BLOCCO_MAX, ultimaSezione: k === sezioni.length - 1 },
      });
      blocchi.push(...r.blocchi);
    }
    if (!blocchi.length) throw new Error('Nel testo non c\'e\' niente da leggere.');
    Object.assign(stato.mp3, { fase: 'sintesi', totale: blocchi.length });
    pubblica();
    for (let i = 0; i < blocchi.length; i++) {
      await cediAllaLettura(J);
      const b = blocchi[i];
      const r = await chiedi({ tipo: 'sintetizza', fonemi: b.fonemi, velocita: vel, voce: v, pausa: b.pausa, sessione: J.id });
      if (J !== lavoroMp3) throw new Annullato();
      stato.mp3.secondi = +(stato.mp3.secondi + r.audio.length / FREQUENZA).toFixed(2);
      enc.manda({ tipo: 'aggiungi', audio: r.audio }, [r.audio.buffer]);
      blocchi[i] = null; // i fonemi gia' usati non servono piu'
      stato.mp3.fatti = i + 1;
      pubblica(false);
    }
    stato.mp3.fase = 'codifica';
    pubblica();
    const fatto = await enc.chiedi({ tipo: 'fine' });
    if (J !== lavoroMp3) throw new Annullato();
    const tag = tagId3({ titolo: titolo || nome.replace(/\.mp3$/, ''), artista: `WebG Voice, voce ${VOCI[v].nome}`, album: 'WebG Voice' });
    const blob = new Blob([tag, fatto.blob], { type: 'audio/mpeg' });
    urlMp3 = URL.createObjectURL(blob);
    Object.assign(stato.mp3, { fase: 'pronto', url: urlMp3, byte: blob.size, secondi: +fatto.secondi.toFixed(1), ms: Date.now() - J.t0, quando: Date.now(), salvato: false });
    lavoroMp3 = null;
    pubblica();
  } catch (e) {
    if (J !== lavoroMp3) return; // annullato o sostituito
    lavoroMp3 = null;
    if (codificatore) codificatore.chiudi();
    if (e instanceof Annullato) stato.mp3 = null;
    else stato.mp3 = { ...stato.mp3, fase: 'errore', errore: String(e && e.message ? e.message : e) };
    pubblica();
  }
}

function annullaMp3(pubblicare = true) {
  const J = lavoroMp3;
  if (J) {
    lavoroMp3 = null;
    worker.postMessage({ tipo: 'annulla', sessione: J.id });
    if (codificatore) codificatore.chiudi();
  }
  if (pubblicare) {
    if (stato.mp3 && stato.mp3.fase !== 'pronto') stato.mp3 = null;
    pubblica();
  }
}

// l'offscreen document non ha chrome.runtime.getURL: l'indirizzo si ricava dal proprio
const URL_BACKGROUND = new URL('background.js', location.href).href;
// dizionario personale: solo coppie di stringhe brevi
const dizionarioValido = (d) =>
  Array.isArray(d)
    ? d.filter((v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 100)).slice(0, 300)
    : [];
const titoloValido = (t) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, 300) : null);
chrome.runtime.onMessage.addListener((msg, mittente, rispondi) => {
  if (mittente.id !== chrome.runtime.id) return;
  // all'offscreen parla solo il service worker
  if (mittente.url !== URL_BACKGROUND) return;
  if (!msg || typeof msg !== 'object' || msg.a !== 'offscreen') return;
  if ((msg.tipo === 'leggi' || msg.tipo === 'mp3') && (typeof msg.testo !== 'string' || msg.testo.length > 2_000_000)) return;
  if (msg.tipo === 'velocita' && !(typeof msg.valore === 'number' && Number.isFinite(msg.valore))) return;
  if (msg.tipo === 'leggi' && msg.rtf !== undefined && !(typeof msg.rtf === 'number' && Number.isFinite(msg.rtf) && msg.rtf > 0.05 && msg.rtf < 20)) msg.rtf = undefined;
  switch (msg.tipo) {
    case 'leggi':
      leggi({
        bozza: msg.bozza === true,
        testo: msg.testo,
        velocita: msg.velocita,
        tabId: msg.tabId,
        t0: msg.t0,
        rtf: msg.rtf,
        dizionario: dizionarioValido(msg.dizionario),
        voce: voceValida(msg.voce),
        titolo: titoloValido(msg.titolo),
      });
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
    case 'voce':
      impostaVoce(msg.valore);
      break;
    case 'mp3':
      creaMp3({
        testo: msg.testo,
        titolo: titoloValido(msg.titolo),
        velocita: msg.velocita,
        voce: voceValida(msg.voce),
        dizionario: dizionarioValido(msg.dizionario),
      });
      break;
    case 'annullaMp3':
      annullaMp3();
      break;
    case 'mp3Salvato':
      if (stato.mp3 && stato.mp3.fase === 'pronto') stato.mp3.salvato = true;
      pubblica();
      break;
    case 'chiudiMp3':
      if (stato.mp3 && stato.mp3.fase !== 'sintesi' && stato.mp3.fase !== 'preparazione' && stato.mp3.fase !== 'codifica') {
        stato.mp3 = null;
        liberaMp3();
      }
      pubblica();
      break;
    case 'preparaMotore':
      consenti();
      break;
    case 'avvioAutomatico':
      scaricaInSottofondo();
      break;
    case 'prerisc':
      preriscalda();
      break;
    case 'riallinea':
      if (lettura && lettura.tabId === msg.tabId) lettura.riallinea = true;
      break;
    case 'attivita':
      // il service worker segnala che Chrome e' in uso (e se tenere pronta la voce)
      ultimaAttivita = Date.now();
      if (typeof msg.tienePronta === 'boolean') tienePronta = msg.tienePronta;
      break;
    case 'stato':
      break;
    default:
      return;
  }
  rispondi({ stato });
});

// il controllo del riposo parte subito (qui, dopo tutte le dichiarazioni)
controllaRiposo();

// @@test-inizio  (tolto dalla build di produzione, vedi scripts/build.mjs)
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
  // frase che si sente adesso (l'ultimo blocco col testo scritto fino a quello che suona) e tempo dell'audio
  fraseCorrente: () => {
    const L = lettura;
    if (!L || !ctx) return null;
    const t = ctx.currentTime;
    const v = L.sorgenti.find((x) => x.inizio <= t + 0.02 && t < x.fine);
    if (!v) return { tempo: t, testo: null };
    for (let i = v.indice; i >= 0; i--) if (L.blocchi[i] && L.blocchi[i].testo) return { tempo: t, indice: v.indice, testo: L.blocchi[i].testo };
    return { tempo: t, indice: v.indice, testo: null };
  },
  blocchi: () => (ultimaLettura ? ultimaLettura.blocchi.map((b) => ({ ...b, fonemi: ultimaLettura.pezzi.slice(b.da, b.a).map((p) => p.fonemi).join(' ') })) : []),
  registra: (si = true) => {
    registra = si;
  },
  registrazioneWav: () => {
    const a = unisci(ultimaLettura ? ultimaLettura.registrazione : []);
    return { secondi: a.length / FREQUENZA, wav: base64(wav(a)) };
  },
  fonemi: async (testo, opz = {}) => (await chiedi({ tipo: 'fonemi', testo, ...opz })).fonemi,
  sintesiFedele: async (testo, velocita = 1, voce = 'sara') => {
    await motore();
    const r = await chiedi({ tipo: 'sintesiFedele', testo, velocita, voce });
    return { fonemi: r.fonemi, lotti: r.lotti, ms: r.ms, secondi: r.audio.length / FREQUENZA, wav: base64(wav(r.audio)) };
  },
  contesto: () => ({ stato: ctx && ctx.state, tempo: ctx && ctx.currentTime }),
  // come se il browser sospendesse l'audio da se'
  sospendiAudio: () => ctx && ctx.suspend(),
  provaFonte: (url) => chiedi({ tipo: 'provaFonte', url }),
  // simula un PC lento o veloce: fissa la stima e la blocca alle misure vere
  forzaRtf: (v) => {
    rtf = v;
    stato.rtf = v;
    aggiornaRtfOriginale ??= aggiornaRtf;
    aggiornaRtf = () => {};
  },
  parametri: () => ({ rtf: rtfUsato(), costo: stimaCosto(), lettura: ultimaLettura && ultimaLettura.parametri, fonemi: stato.metriche.fonemi || [] }),
  statoCache: () => chiedi({ tipo: 'statoCache' }),
  // MP3 pronto in base64, per controllarlo fuori dal browser
  mp3Base64: async () => (urlMp3 ? base64(new Uint8Array(await (await fetch(urlMp3)).arrayBuffer())) : null),
  inAttesaLettura: () => (lettura ? lettura.inAttesa : null),
  // banco di prova: avvio del motore con opzioni di sessione di prova; restituisce info e tempi
  avvia: async (opzioni) => {
    const t0 = performance.now();
    if (opzioni) await chiedi({ tipo: 'avvia', opzioni });
    await motore();
    return { ms: Math.round(performance.now() - t0), info: stato.info };
  },
  // banco di prova: N motori in parallelo (ognuno con `fili` thread) sugli stessi blocchi
  parallelo: async (testo, nMotori = 2, fili = 4, nBlocchi = 12, n = 150, opzioni) => {
    const motori = [];
    const t0 = performance.now();
    for (let k = 0; k < nMotori; k++) {
      const w = new Worker(new URL('./motore-worker.js', import.meta.url), { type: 'module' });
      let id = 0;
      const att = new Map();
      w.onmessage = (ev) => {
        const a = att.get(ev.data.id);
        if (!a) return;
        att.delete(ev.data.id);
        if (ev.data.tipo === 'errore') a.rifiuta(new Error(ev.data.messaggio));
        else a.risolvi(ev.data);
      };
      const ch = (m) => new Promise((risolvi, rifiuta) => { const i = ++id; att.set(i, { risolvi, rifiuta }); w.postMessage({ ...m, id: i }); });
      motori.push({ w, ch });
    }
    await Promise.all(motori.map((m) => m.ch({ tipo: 'avvia', fili, opzioni })));
    const caricamentoMs = Math.round(performance.now() - t0);
    const tutti = (await motori[0].ch({ tipo: 'fonemi', testo, normalizza: true })).fonemi.split(' ');
    const lista = [];
    for (let k = 0, i = 0; k < nBlocchi; k++) {
      let b = '';
      while ([...b].length < n) b += (b ? ' ' : '') + tutti[i++ % tutti.length];
      lista.push(b);
    }
    // riscaldamento, poi misura: ogni motore prende il prossimo blocco libero
    await Promise.all(motori.map((m) => m.ch({ tipo: 'sintetizza', fonemi: lista[0], velocita: 1, pausa: 0 })));
    let prossimo = 0;
    let audio = 0;
    const t1 = performance.now();
    await Promise.all(
      motori.map(async (m) => {
        while (prossimo < lista.length) {
          const r = await m.ch({ tipo: 'sintetizza', fonemi: lista[prossimo++], velocita: 1, pausa: 0 });
          audio += r.audio.length / FREQUENZA;
        }
      })
    );
    const ms = performance.now() - t1;
    for (const m of motori) m.w.terminate();
    return { nMotori, fili, caricamentoMs, secondiAudio: +audio.toFixed(1), ms: Math.round(ms), rtfComplessivo: +(ms / 1000 / audio).toFixed(3) };
  },
  // banco di prova: costo della sintesi per lunghezza del blocco (fonemi), ripetuto
  banco: async (testo, lunghezze = [15, 30, 45, 60, 90, 150, 300], ripeti = 3, fili, opzioni) => {
    const t0 = performance.now();
    if (fili || opzioni) await chiedi({ tipo: 'avvia', fili, opzioni });
    await motore();
    const caricamentoMs = Math.round(performance.now() - t0);
    const tutti = (await chiedi({ tipo: 'fonemi', testo, normalizza: true })).fonemi;
    const taglia = (n) => {
      const c = [...tutti];
      let i = Math.min(n, c.length);
      while (i < c.length && c[i] !== ' ') i++;
      return c.slice(0, i).join('');
    };
    const out = { caricamentoMs, misure: [] };
    let prima = true;
    for (let k = 0; k < ripeti; k++) {
      for (const n of lunghezze) {
        const f = taglia(n);
        const r = await chiedi({ tipo: 'sintetizza', fonemi: f, velocita: 1, pausa: 0 });
        let nan = 0;
        let q = 0;
        for (const x of r.audio) {
          if (!Number.isFinite(x)) nan++;
          else q += x * x;
        }
        const rms = +Math.sqrt(q / Math.max(1, r.audio.length)).toFixed(4);
        out.misure.push({ n: [...f].length, ms: r.ms, sec: +(r.audio.length / FREQUENZA).toFixed(3), prima, nan, rms });
        if (k === 0) (out.wav ||= {})[n] = base64(wav(r.audio));
        prima = false;
      }
    }
    return out;
  },
};
// @@test-fine
