// Dettatura, lato service worker: Ctrl+Spazio, scelta del campo nella scheda, ponte fra l'offscreen
// document (microfono e Whisper, ascolto.js) e la pagina (pulizia e inserimento, dettatura-pagina.js).
// Una dettatura alla volta, legata alla scheda dove e' partita: se si cambia scheda si ferma.

import { MODELLI_DETTATURA, modelloDettaturaValido } from './lib/modelli-dettatura.js';

const PAGINA = 'dettatura.html';
const BASE = chrome.runtime.getURL('');

// stato della dettatura in corso, anche in storage.session (il service worker puo' ripartire)
let D = null; // { tabId, frameCampo, sessione, pagina }
async function dett() {
  if (D) return D;
  const { dettatura } = await chrome.storage.session.get('dettatura');
  D = dettatura || null;
  return D;
}
async function salva(v) {
  D = v;
  if (v) await chrome.storage.session.set({ dettatura: v });
  else await chrome.storage.session.remove('dettatura');
}

/** Impostazioni della dettatura (opzioni). */
export async function impostazioniDettatura() {
  const l = await chrome.storage.local.get(['dettModello', 'dettPunteggiatura', 'dettMotore']);
  const { dettDizionario: d } = await chrome.storage.sync.get('dettDizionario');
  const sostituzioni = d && Array.isArray(d.sostituzioni) ? d.sostituzioni.filter((v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string')) : [];
  const termini = d && Array.isArray(d.termini) ? d.termini.filter((x) => typeof x === 'string' && x.trim()) : [];
  return {
    modello: modelloDettaturaValido(l.dettModello),
    automatica: l.dettPunteggiatura !== false,
    motore: l.dettMotore === 'webspeech' ? 'webspeech' : 'whisper',
    sostituzioni: sostituzioni.slice(0, 200),
    // le parole scritte nelle sostituzioni sono anche termini ricorrenti per Whisper
    termini: [...new Set([...termini, ...sostituzioni.map((v) => v[1])])].slice(0, 60),
  };
}

// Eseguita in ogni frame: il campo col cursore
function sondaCampo() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  const testo = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/i.test(el.type || ''))) && !el.readOnly && !el.disabled;
  return { focus: document.hasFocus(), campo: !!(testo || (el && el.isContentEditable)), principale: window === window.top };
}

/**
 * @param {object} c { aOffscreen, assicuraOffscreen, scorciatoia, fermaLettura }
 */
export function creaDettatura(c) {
  async function apriPagina(motivo) {
    const url = chrome.runtime.getURL(`${PAGINA}${motivo ? `#${motivo}` : ''}`);
    await chrome.tabs.create({ url });
  }

  async function badge(s) {
    const d = await dett();
    if (!d) return;
    let testo = '';
    let colore = '#c0392b';
    if (s.fase === 'preparazione' && s.download && s.download.totale) {
      testo = `${Math.floor((100 * s.download.scaricati) / s.download.totale)}%`;
      colore = '#23417b';
    } else if (['ascolto', 'parlato', 'preparazione'].includes(s.fase)) testo = 'REC';
    else if (s.fase === 'errore') {
      testo = '!';
      colore = '#d86f22';
    }
    try {
      await chrome.action.setBadgeBackgroundColor({ tabId: d.tabId, color: colore });
      await chrome.action.setBadgeText({ tabId: d.tabId, text: testo });
    } catch {}
  }

  const aPagina = (d, frameId, m) =>
    d.pagina ? chrome.runtime.sendMessage({ a: 'paginaDettatura', ...m }).catch(() => null) : chrome.tabs.sendMessage(d.tabId, m, { frameId }).catch(() => null);

  async function avvia(tab, opz = {}) {
    if (!tab || tab.id === undefined) return { avviata: false, motivo: 'nessunaScheda' };
    const imp = await impostazioniDettatura();
    await c.assicuraOffscreen();
    const perm = await c.aOffscreen({ tipo: 'dettPermesso' });
    const pronto = imp.motore === 'webspeech' ? { completo: true } : await c.aOffscreen({ tipo: 'dettPronto', modello: imp.modello });
    if (perm.permesso !== 'granted' || !pronto.completo) {
      // primo uso: microfono e modello si preparano nella pagina della dettatura
      if (!opz.pagina) await apriPagina(perm.permesso !== 'granted' ? 'microfono' : 'modello');
      return { avviata: false, motivo: 'primoUso', permesso: perm.permesso, modelloPronto: pronto.completo };
    }
    const r = await preparaScheda(tab, imp, !!opz.pagina);
    if (!r.d) return { avviata: false, motivo: r.motivo };
    await c.fermaLettura();
    await c.aOffscreen({ tipo: 'dettAvvia', modello: imp.modello, termini: imp.termini, motore: imp.motore, t0: Date.now() });
    return { avviata: true, campo: r.haCampo };
  }

  /** Inietta lo script nella scheda (frame principale e frame del campo) e lo avvia. */
  async function preparaScheda(tab, imp, pagina) {
    let frameCampo = 0;
    let haCampo = pagina;
    if (!pagina) {
      let r = [];
      try {
        r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: sondaCampo });
      } catch {
        try {
          r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: sondaCampo });
        } catch {
          return { motivo: 'protetta' };
        }
      }
      const scelto = r.find((x) => x.result && x.result.focus && x.result.campo) || r.find((x) => x.result && x.result.campo && x.result.principale);
      if (scelto) {
        frameCampo = scelto.frameId || 0;
        haCampo = true;
      }
      const frameIds = [...new Set([0, frameCampo])];
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds }, files: ['pulizia-pagina.js', 'dettatura-pagina.js'] });
      } catch {
        return { motivo: 'protetta' };
      }
    }
    const d = { tabId: tab.id, frameCampo, sessione: Date.now(), pagina };
    await salva(d);
    const tasto = await c.scorciatoia('dettatura');
    const base = { sostituzioni: imp.sostituzioni, automatica: imp.automatica, scorciatoia: tasto };
    if (frameCampo !== 0) await aPagina(d, 0, { dett: 'avvia', indicatore: true, campo: false, ...base });
    await aPagina(d, frameCampo, { dett: 'avvia', indicatore: frameCampo === 0, campo: haCampo, casella: !haCampo, ...base });
    return { d, haCampo };
  }

  async function ferma() {
    const d = await dett();
    if (await chrome.offscreen.hasDocument()) await c.aOffscreen({ tipo: 'dettFerma' }).catch(() => {});
    // dettaturaFinita (dall'offscreen) chiude la pagina; se l'offscreen non c'e' piu', si chiude qui
    if (d && !(await chrome.offscreen.hasDocument())) chiudi(d);
  }

  async function chiudi(d) {
    await aPagina(d, d.frameCampo, { dett: 'fine' });
    if (d.frameCampo !== 0) await aPagina(d, 0, { dett: 'stato', stato: { fase: 'inattiva' } });
    try {
      await chrome.action.setBadgeText({ tabId: d.tabId, text: '' });
    } catch {}
    await salva(null);
  }

  async function attiva() {
    const d = await dett();
    if (!d) return false;
    if (!(await chrome.offscreen.hasDocument())) {
      await salva(null);
      return false;
    }
    try {
      const r = await c.aOffscreen({ tipo: 'dettStato' });
      if (!r.attiva) await salva(null);
      return !!r.attiva;
    } catch {
      return false;
    }
  }

  /** Ctrl+Spazio: avvia o ferma. */
  async function alterna(tab) {
    if (await attiva()) {
      await ferma();
      return { fermata: true };
    }
    return avvia(tab);
  }

  /** Messaggi dall'offscreen document (gia' verificati dal chiamante). */
  async function daOffscreen(msg) {
    const d = await dett();
    if (msg.tipo === 'statoDettatura') {
      if (!d) return;
      badge(msg.stato);
      await aPagina(d, 0, { dett: 'stato', stato: msg.stato });
      return;
    }
    if (msg.tipo === 'dettato') {
      if (!d) return;
      const r = await aPagina(d, d.frameCampo, { dett: 'testo', testo: msg.testo, pausa: msg.pausa, probSilenzio: msg.probSilenzio, logprob: msg.logprob });
      if (r && r.casella) await aPagina(d, 0, { dett: 'casella', testo: r.casella });
      if (r && r.stop) await ferma();
      return;
    }
    if (msg.tipo === 'dettaturaFinita') {
      if (d) await chiudi(d);
    }
  }

  // cambio di scheda, scheda chiusa o ricaricata: la dettatura si ferma
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const d = await dett();
    if (d && d.tabId !== tabId) ferma();
  });
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const d = await dett();
    if (d && d.tabId === tabId) {
      await salva(null);
      if (await chrome.offscreen.hasDocument()) c.aOffscreen({ tipo: 'dettFerma' }).catch(() => {});
    }
  });
  chrome.tabs.onUpdated.addListener(async (tabId, info) => {
    if (info.status !== 'loading') return;
    const d = await dett();
    if (d && d.tabId === tabId && !d.pagina) ferma();
  });

  return { alterna, avvia, ferma, attiva, daOffscreen, apriPagina, preparaScheda, MODELLI_DETTATURA };
}
