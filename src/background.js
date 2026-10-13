// Service worker: menu contestuale, scorciatoia, ponte fra popup/barretta e
// l'offscreen document che fa sintesi e audio.

const OFFSCREEN = 'offscreen.html';
const VEL_DEFAULT = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'leggi-selezione',
    title: 'Leggi ad alta voce',
    contexts: ['selection'],
  });
});

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

async function velocitaSalvata() {
  const { velocita } = await chrome.storage.local.get('velocita');
  return typeof velocita === 'number' ? velocita : VEL_DEFAULT;
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

// Eseguita nella pagina: il testo selezionato, anche dentro campi di testo
function leggiSelezioneNellaPagina() {
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email)$/i.test(el.type)))) {
    const t = el.value.substring(el.selectionStart || 0, el.selectionEnd || 0);
    if (t.trim()) return t;
  }
  const s = window.getSelection();
  return s ? s.toString() : '';
}

async function iniettaBarra(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['barra.js'] });
    return true;
  } catch {
    return false; // pagine protette (chrome://, Web Store): si legge lo stesso, senza barretta
  }
}

/** Restituisce true se ha avviato una lettura (o un'attesa di conferma). */
async function leggiDaScheda(tab, testoDiRiserva, daPopup = false) {
  const t0 = Date.now();
  if (!tab || tab.id === undefined) return false;
  let testo = '';
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: leggiSelezioneNellaPagina });
    testo = (r && r.result) || '';
  } catch {
    // niente accesso alla pagina: resta il testo del menu contestuale
  }
  if (!testo.trim()) testo = testoDiRiserva || '';
  if (!testo.trim() && daPopup) return false;
  if (!testo.trim()) {
    // scorciatoia senza selezione: pausa/riprendi la lettura in corso
    const s = await statoAttuale();
    if (s && (s.fase === 'lettura' || s.fase === 'pausa' || s.fase === 'preparazione')) {
      await aOffscreen({ tipo: 'alterna' });
    }
    return false;
  }
  const conBarra = await iniettaBarra(tab.id);
  await aOffscreen({ tipo: 'leggi', testo, velocita: await velocitaSalvata(), rtf: await rtfSalvato(), tabId: conBarra ? tab.id : null, t0 });
  return true;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'leggi-selezione') leggiDaScheda(tab, info.selectionText);
});

chrome.commands.onCommand.addListener(async (comando, tab) => {
  if (comando === 'leggi-selezione') {
    const t = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    leggiDaScheda(t);
  } else if (comando === 'ferma-lettura') {
    if (await chrome.offscreen.hasDocument()) aOffscreen({ tipo: 'stop' });
  }
});

chrome.runtime.onMessage.addListener((msg, mittente, rispondi) => {
  if (!msg) return;
  // Stato dall'offscreen: lo giro alla scheda che ha la barretta
  if (msg.da === 'offscreen' && msg.tipo === 'stato') {
    const tabId = msg.stato && msg.stato.tabId;
    if (tabId !== null && tabId !== undefined) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
    return;
  }
  if (msg.da === 'offscreen' && msg.tipo === 'rtf') {
    chrome.storage.local.set({ rtf: msg.valore });
    return;
  }
  if (msg.da === 'offscreen' && msg.tipo === 'riposo') {
    chrome.offscreen.closeDocument().catch(() => {});
    return;
  }
  if (msg.a !== 'background') return;
  (async () => {
    switch (msg.tipo) {
      case 'stato': {
        const s = await statoAttuale();
        return { stato: s, velocita: await velocitaSalvata() };
      }
      case 'leggiTesto':
        return aOffscreen({ tipo: 'leggi', testo: msg.testo, velocita: await velocitaSalvata(), rtf: await rtfSalvato(), tabId: null, t0: Date.now() });
      case 'velocita':
        await chrome.storage.local.set({ velocita: msg.valore });
        if (await chrome.offscreen.hasDocument()) return aOffscreen({ tipo: 'velocita', valore: msg.valore });
        return { ok: true };
      case 'preparaMotore':
        return aOffscreen({ tipo: 'preparaMotore' });
      case 'leggiSelezioneAttiva': {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return { letto: await leggiDaScheda(tab, '', true) };
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
