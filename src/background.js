// Service worker: menu contestuale, scorciatoia, ponte fra popup/barretta e
// l'offscreen document che fa sintesi e audio.

import { modelliInCache, VOCI, voceValida } from './lib/modelli.js';
import { impronta } from './lib/impronta.js';
import { leggiDizionario } from './lib/dizionario.js';

const OFFSCREEN = 'offscreen.html';
const VEL_DEFAULT = 1;

chrome.runtime.onInstalled.addListener((info) => {
  if (info.reason === 'install' || info.reason === 'update') avviaDownloadSeServe();
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'leggi-selezione',
    title: chrome.i18n.getMessage('menuLeggi'),
    contexts: ['selection'],
  });
  // tasto destro sulla pagina, senza selezione: tutto l'articolo
  chrome.contextMenus.create({
    id: 'leggi-articolo',
    title: chrome.i18n.getMessage('menuArticolo'),
    contexts: ['page'],
  });
});

chrome.runtime.onStartup.addListener(() => avviaDownloadSeServe());

/** Se il modello non e' ancora sul computer, il download parte in sottofondo. */
async function avviaDownloadSeServe() {
  try {
    if (await modelliInCache()) return;
    await aOffscreen({ tipo: 'avvioAutomatico' });
  } catch (e) {
    console.warn('download automatico non avviato:', e && e.message);
  }
}

// Badge dell'icona: avanzamento del download del modello (blu) oppure della
// creazione dell'MP3 (verde), e "MP3" quando il file e' pronto da salvare.
let ultimoBadge = '';
let ultimoTitolo = '';
function aggiornaBadge(s) {
  const d = s && s.download;
  const m = s && s.mp3;
  let testo = '';
  let colore = '#23417b';
  let titolo = chrome.i18n.getMessage('titoloAzione');
  if (d && d.totale && !d.inAttesa && d.scaricati < d.totale) {
    testo = d.interrotto ? '!' : `${Math.floor((100 * d.scaricati) / d.totale)}%`;
    if (d.interrotto) colore = '#b3261e';
  } else if (m && ['preparazione', 'sintesi', 'codifica'].includes(m.fase)) {
    testo = m.totale ? `${Math.floor((100 * m.fatti) / m.totale)}%` : '…';
    colore = '#1e7d32';
    titolo = `WebG Voice: creo l'MP3 (${testo})`;
  } else if (m && m.fase === 'pronto' && !m.salvato) {
    testo = 'MP3';
    colore = '#1e7d32';
    titolo = 'WebG Voice: MP3 pronto, apri il pannello per salvarlo';
  }
  if (titolo !== ultimoTitolo) {
    ultimoTitolo = titolo;
    chrome.action.setTitle({ title: titolo });
  }
  if (testo + colore === ultimoBadge) return;
  ultimoBadge = testo + colore;
  chrome.action.setBadgeBackgroundColor({ color: colore });
  chrome.action.setBadgeText({ text: testo });
}

let creazione = null;
async function assicuraOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creazione ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: ['AUDIO_PLAYBACK', 'WORKERS'],
      justification: 'Sintesi vocale locale (Web Worker con ONNX Runtime) e riproduzione audio della lettura ad alta voce',
    })
    .finally(() => {
      creazione = null;
    });
  await creazione;
}

/** Manda un messaggio all'offscreen document (creandolo se serve) e ne restituisce la risposta. */
async function aOffscreen(msg) {
  await assicuraOffscreen();
  for (let tentativo = 0; tentativo < 20; tentativo++) {
    try {
      const r = await chrome.runtime.sendMessage({ ...msg, a: 'offscreen' });
      if (r) return r;
    } catch {
      // il documento sta ancora caricando i suoi script
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('il motore di lettura non risponde');
}

async function rtfSalvato() {
  const { rtf } = await chrome.storage.local.get('rtf');
  return typeof rtf === 'number' ? rtf : undefined;
}

/** Dizionario personale di pronuncia, dalle opzioni: [[scritto, lettura], ...] */
async function dizionario() {
  try {
    return await leggiDizionario();
  } catch {
    return [];
  }
}

async function velocitaSalvata() {
  const { velocita } = await chrome.storage.local.get('velocita');
  return typeof velocita === 'number' ? velocita : VEL_DEFAULT;
}

async function voceSalvata() {
  const { voce } = await chrome.storage.local.get('voce');
  return voceValida(voce);
}

/** Tutto quello che serve all'offscreen per leggere o creare un MP3 con le impostazioni dell'utente. */
async function impostazioni() {
  const [velocita, rtf, diz, voce] = await Promise.all([velocitaSalvata(), rtfSalvato(), dizionario(), voceSalvata()]);
  return { velocita, rtf, dizionario: diz, voce };
}

async function statoAttuale() {
  if (!(await chrome.offscreen.hasDocument())) return null;
  try {
    const r = await chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stato' });
    return r ? r.stato : null;
  } catch {
    return null;
  }
}

// Eseguita in ogni frame della scheda: il testo selezionato e se il frame ha il
// focus. Copre la selezione normale e i contenteditable (getSelection), le
// textarea e gli input (selectionStart/End), e gli editor di codice come
// CodeMirror 5 o Ace, che tengono il testo selezionato in una textarea nascosta.
function leggiSelezioneNelFrame() {
  let testo = '';
  let el = document.activeElement;
  // focus dentro uno shadow DOM (componenti web)
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(el.type || '')))) {
    try {
      testo = el.value.substring(el.selectionStart || 0, el.selectionEnd || 0);
    } catch {}
  }
  if (!testo.trim()) {
    const sel = window.getSelection();
    testo = sel ? sel.toString() : '';
  }
  return { testo, focus: document.hasFocus(), principale: window === window.top };
}

// Eseguita nel frame principale: origini dei riquadri (iframe) di altri siti,
// dove activeTab non arriva.
function riquadriEsterni() {
  const mie = location.origin;
  const out = new Set();
  for (const f of document.querySelectorAll('iframe[src], frame[src]')) {
    try {
      const o = new URL(f.src, location.href).origin;
      if (o !== mie && /^https?:/.test(o)) out.add(o);
    } catch {}
  }
  return [...out];
}

/** Selezione da tutti i frame raggiungibili: vince quello col focus, poi il principale. */
async function selezioneDellaScheda(tabId, frameId) {
  const target = frameId !== undefined && frameId !== 0 ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true };
  let risultati = [];
  try {
    risultati = await chrome.scripting.executeScript({ target, func: leggiSelezioneNelFrame });
  } catch {
    // un frame non accessibile puo' far fallire allFrames: si riprova sul solo frame principale
    try {
      risultati = await chrome.scripting.executeScript({ target: { tabId }, func: leggiSelezioneNelFrame });
    } catch {
      return { testo: '', protetta: true }; // pagina dove Chrome non lascia entrare le estensioni
    }
  }
  const pieni = risultati.map((r) => r && r.result).filter((r) => r && r.testo && r.testo.trim());
  if (!pieni.length) return { testo: '', protetta: false };
  pieni.sort((x, y) => Number(y.focus) - Number(x.focus) || Number(y.principale) - Number(x.principale));
  return { testo: pieni[0].testo, protetta: false };
}

// ---- Riscontro quando non si puo' leggere: badge "!" sulla scheda, titolo col motivo,
// e un avviso che il popup mostra se lo si apre subito dopo ----
async function scorciatoia(nome) {
  const c = (await chrome.commands.getAll()).find((x) => x.name === nome);
  return c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc') : '';
}
async function avvisa(tabId, motivo) {
  const tasto = await scorciatoia('leggi-selezione');
  const testi = {
    protetta: 'Chrome non permette la lettura su questa pagina: apri il pulsante di WebG Voice e incolla il testo.',
    vuoto: tasto ? `Seleziona un testo e premi ${tasto}.` : 'Seleziona un testo e usa la scorciatoia o il tasto destro.',
    articolo: tasto
      ? `Non trovo un articolo da leggere in questa pagina: seleziona il testo e premi ${tasto}.`
      : 'Non trovo un articolo da leggere in questa pagina: seleziona il testo e usa la scorciatoia o il tasto destro.',
  };
  const titolo = testi[motivo];
  await chrome.storage.session.set({ avviso: { tabId, motivo, titolo, quando: Date.now() } });
  if (tabId === undefined) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d86f22' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title: `WebG Voice: ${titolo}` });
  } catch {}
  setTimeout(async () => {
    try {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: chrome.i18n.getMessage('titoloAzione') });
    } catch {}
  }, 5000);
}

/**
 * Articolo della pagina (titolo e testo, senza menu e pubblicita') con Mozilla
 * Readability, iniettato solo ora nel frame principale.
 * Restituisce { testo, titolo, parole } oppure { nessuno: true } o { protetta: true }.
 */
async function articoloDellaScheda(tabId) {
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/readability/Readability.js', 'articolo.js'] });
    const a = r && r[0] && r[0].result;
    if (a && typeof a.testo === 'string' && a.testo.trim()) return { testo: a.testo.slice(0, MAX_TESTO), titolo: a.titolo || null, parole: a.parole, ms: a.ms };
    return { nessuno: true, motivo: a && a.motivo };
  } catch {
    return { protetta: true }; // pagina dove Chrome non lascia entrare le estensioni
  }
}

/**
 * Cosa leggere nella scheda. modo: 'selezione' (solo la selezione), 'articolo'
 * (sempre l'articolo), 'auto' (la selezione e, se non c'e', l'articolo).
 * Restituisce { testo, titolo } oppure { motivo: 'protetta' | 'vuoto' | 'articolo' }.
 */
async function testoDellaScheda(tab, { modo = 'auto', riserva = '', frameId } = {}) {
  if (modo !== 'articolo') {
    const sel = await selezioneDellaScheda(tab.id, frameId);
    const testo = sel.testo.trim() ? sel.testo : riserva || '';
    if (testo.trim()) return { testo, titolo: null };
    if (sel.protetta) return { motivo: 'protetta' };
    if (modo === 'selezione') return { motivo: 'vuoto' };
  }
  const a = await articoloDellaScheda(tab.id);
  if (a.protetta) return { motivo: 'protetta' };
  if (a.nessuno) return { motivo: 'articolo' };
  return { testo: a.testo, titolo: a.titolo };
}

async function iniettaBarra(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['barra.js'] });
    return true;
  } catch {
    return false; // pagine protette (chrome://, Web Store): si legge lo stesso, senza barretta
  }
}

const IN_CORSO = ['lettura', 'pausa', 'preparazione'];

/**
 * Legge nella scheda. Con la scorciatoia (daPopup false): la selezione; senza
 * selezione mette in pausa o riprende la lettura in corso, e se non c'e' niente
 * in corso legge l'articolo della pagina.
 * Restituisce true se ha avviato una lettura, altrimenti false o, quando la
 * chiamata viene dal popup, il motivo ('protetta', 'vuoto', 'articolo').
 */
async function leggiDaScheda(tab, testoDiRiserva, daPopup = false, frameId = undefined, modo = 'auto') {
  const t0 = Date.now();
  if (!tab || tab.id === undefined) return false;
  let scelto;
  if (!daPopup && modo === 'auto') {
    // senza accesso al frame (es. riquadro di un altro sito) resta il testo del menu contestuale
    scelto = await testoDellaScheda(tab, { modo: 'selezione', riserva: testoDiRiserva, frameId });
    if (scelto.motivo === 'vuoto') {
      // scorciatoia senza selezione: pausa/riprendi la lettura in corso, altrimenti l'articolo
      const s = await statoAttuale();
      if (s && IN_CORSO.includes(s.fase)) {
        await aOffscreen({ tipo: 'alterna' });
        return false;
      }
      scelto = await testoDellaScheda(tab, { modo: 'articolo' });
    }
  } else {
    scelto = await testoDellaScheda(tab, { modo, riserva: testoDiRiserva, frameId });
  }
  if (!scelto.testo) {
    if (daPopup) return scelto.motivo;
    await avvisa(tab.id, scelto.motivo);
    return false;
  }
  const testo = scelto.testo;
  // Alt+Q sullo stesso testo che si sta leggendo: pausa o ripresa, non si ricomincia
  if (!daPopup) {
    const s = await statoAttuale();
    if (s && IN_CORSO.includes(s.fase) && s.impronta === impronta(testo)) {
      await aOffscreen({ tipo: 'alterna' });
      return true;
    }
  }
  const conBarra = await iniettaBarra(tab.id);
  await aOffscreen({ tipo: 'leggi', testo, titolo: scelto.titolo, ...(await impostazioni()), tabId: conBarra ? tab.id : null, t0 });
  return true;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'leggi-selezione') leggiDaScheda(tab, info.selectionText, false, info.frameId);
  else if (info.menuItemId === 'leggi-articolo') leggiDaScheda(tab, '', false, undefined, 'articolo');
});

chrome.commands.onCommand.addListener(async (comando, tab) => {
  if (comando === 'leggi-selezione') {
    const t = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    leggiDaScheda(t);
  } else if (comando === 'ferma-lettura') {
    if (await chrome.offscreen.hasDocument()) aOffscreen({ tipo: 'stop' });
  }
});

// ---- Validazione dei messaggi ----
const BASE_ESTENSIONE = chrome.runtime.getURL('');
const daOffscreen = (m) => typeof m.url === 'string' && m.url === chrome.runtime.getURL(OFFSCREEN);
const daPaginaEstensione = (m) => typeof m.url === 'string' && m.url.startsWith(BASE_ESTENSIONE);
// la barretta (content script) puo' solo comandare la lettura in corso
const COMANDI_BARRETTA = new Set(['pausa', 'riprendi', 'stop', 'velocita', 'consenti', 'rifiuta']);
const numeroIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const MAX_TESTO = 2_000_000;

chrome.runtime.onMessage.addListener((msg, mittente, rispondi) => {
  if (mittente.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== 'object') return;
  if (msg.da === 'offscreen' && !daOffscreen(mittente)) return;
  // Stato dall'offscreen: lo giro alla scheda che ha la barretta
  if (msg.da === 'offscreen' && msg.tipo === 'stato') {
    aggiornaBadge(msg.stato);
    const tabId = msg.stato && msg.stato.tabId;
    // alla barretta nella pagina va lo stato della lettura, non quello dell'MP3
    if (tabId !== null && tabId !== undefined) chrome.tabs.sendMessage(tabId, { ...msg, stato: { ...msg.stato, mp3: null } }).catch(() => {});
    return;
  }
  if (msg.da === 'offscreen' && msg.tipo === 'rtf') {
    if (numeroIn(msg.valore, 0.05, 20)) chrome.storage.local.set({ rtf: msg.valore });
    return;
  }
  if (msg.da === 'offscreen' && msg.tipo === 'riposo') {
    chrome.offscreen.closeDocument().catch(() => {});
    return;
  }
  if (msg.a !== 'background') return;
  const daPagina = daPaginaEstensione(mittente);
  const daBarretta = !daPagina && !!mittente.tab;
  if (!daPagina && !(daBarretta && COMANDI_BARRETTA.has(msg.tipo))) return;
  if (msg.tipo === 'velocita' && !numeroIn(msg.valore, 0.7, 1.5)) return;
  if (msg.tipo === 'leggiTesto' && (typeof msg.testo !== 'string' || !msg.testo.trim() || msg.testo.length > MAX_TESTO)) return;
  if (msg.tipo === 'voce' && !Object.hasOwn(VOCI, msg.valore)) return;
  if (msg.tipo === 'mp3' && msg.testo !== undefined && (typeof msg.testo !== 'string' || msg.testo.length > MAX_TESTO)) return;
  (async () => {
    switch (msg.tipo) {
      case 'stato': {
        const s = await statoAttuale();
        return { stato: s, velocita: await velocitaSalvata() };
      }
      case 'prerisc':
        // pannello aperto: il motore si carica se il modello e' gia' sul computer
        if (!(await modelliInCache())) return { ok: false };
        return aOffscreen({ tipo: 'prerisc' });
      case 'leggiTesto':
        return aOffscreen({ tipo: 'leggi', testo: msg.testo, ...(await impostazioni()), tabId: null, t0: Date.now() });
      case 'voce':
        // scelta dal popup o dalle opzioni: si ricorda e, se serve, la voce si scarica subito
        await chrome.storage.local.set({ voce: msg.valore });
        return aOffscreen({ tipo: 'voce', valore: msg.valore });
      case 'leggiArticolo': {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const esito = await leggiDaScheda(tab, '', true, undefined, 'articolo');
        return esito === true ? { letto: true } : { letto: false, motivo: esito || 'articolo' };
      }
      case 'mp3': {
        // testo incollato nel popup, altrimenti la selezione, altrimenti l'articolo della scheda
        let testo = typeof msg.testo === 'string' ? msg.testo : '';
        let titolo = null;
        if (!testo.trim()) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (!tab) return { avviato: false, motivo: 'vuoto' };
          const scelto = await testoDellaScheda(tab, { modo: 'auto' });
          if (!scelto.testo) return { avviato: false, motivo: scelto.motivo };
          testo = scelto.testo;
          titolo = scelto.titolo;
        }
        const imp = await impostazioni();
        await aOffscreen({ tipo: 'mp3', testo, titolo, velocita: imp.velocita, voce: imp.voce, dizionario: imp.dizionario });
        return { avviato: true };
      }
      case 'annullaMp3':
      case 'mp3Salvato':
      case 'chiudiMp3':
        if (await chrome.offscreen.hasDocument()) return aOffscreen({ tipo: msg.tipo });
        return { ok: true };
      case 'velocita':
        await chrome.storage.local.set({ velocita: msg.valore });
        if (await chrome.offscreen.hasDocument()) return aOffscreen({ tipo: 'velocita', valore: msg.valore });
        return { ok: true };
      case 'preparaMotore':
        return aOffscreen({ tipo: 'preparaMotore' });
      case 'leggiSelezioneAttiva': {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const esito = await leggiDaScheda(tab, '', true);
        if (esito === 'protetta') return { letto: false, protetta: true };
        const letto = esito === true;
        if (letto || !tab) return { letto };
        // niente selezione e niente articolo: forse il testo e' in un riquadro di un altro sito senza permesso
        let riquadri = [];
        try {
          const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: riquadriEsterni });
          const tutte = (r && r.result) || [];
          for (const o of tutte) if (!(await chrome.permissions.contains({ origins: [`${o}/*`] }))) riquadri.push(o);
        } catch {}
        return { letto: false, riquadri, nessunArticolo: esito === 'articolo' };
      }
      case 'consenti':
        return aOffscreen({ tipo: 'consenti' });
      case 'rifiuta':
      case 'pausa':
      case 'riprendi':
      case 'alterna':
      case 'stop':
        if (await chrome.offscreen.hasDocument()) return aOffscreen({ tipo: msg.tipo });
        return { ok: true };
      default:
        return { errore: 'comando sconosciuto' };
    }
  })()
    .then(rispondi)
    .catch((e) => rispondi({ errore: String(e.message || e) }));
  return true;
});

// @@test-inizio  (tolto dalla build di produzione)
// Simula la scorciatoia sulla scheda attiva (l'activeTab va concesso prima, es. aprendo il popup)
globalThis.__testScorciatoia = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return leggiDaScheda(tab);
};
// Simula la voce "Leggi tutto l'articolo" del menu sulla scheda attiva
globalThis.__testMenuArticolo = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return leggiDaScheda(tab, '', false, undefined, 'articolo');
};
// Solo l'estrazione, per misurarla sulle pagine vere
globalThis.__testArticolo = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const t = Date.now();
  const a = await articoloDellaScheda(tab.id);
  return { ...a, msTotali: Date.now() - t };
};
// @@test-fine
