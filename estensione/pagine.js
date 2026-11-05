// Benvenuto e guida: scorciatoie vere lette da Chrome, pesi dei modelli presi dal codice,
// avanzamento del download della voce e prova della lettura. Nessun permesso in piu'.
import { BYTE_TOTALI, FILE_VOCI, FILE_VARIANTI, modelliInCache } from './lib/modelli.js';
import { byteModello } from './lib/modelli-dettatura.js';
import { byteChiamata } from './lib/modelli-chiamata.js';

const comando = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra });
const mb = (b) => {
  const v = b / 1e6;
  return v < 10 ? `${v.toFixed(1).replace('.', ',')} MB` : `${Math.round(v)} MB`;
};

// ---- pesi ----
const PESI = {
  voce: BYTE_TOTALI,
  nicola: FILE_VOCI.voceNicola.byte,
  bilanciata: FILE_VARIANTI.modelloU8.byte,
  dettLeggero: byteModello('leggero'),
  dettNormale: byteModello('normale'),
  dettQualita: byteModello('qualita'),
  chiamata: byteChiamata,
};
for (const el of document.querySelectorAll('[data-peso]')) {
  const b = PESI[el.dataset.peso];
  if (b) el.textContent = mb(b);
}

// ---- versione ----
for (const el of document.querySelectorAll('[data-versione]')) el.textContent = chrome.runtime.getManifest().version;

// ---- scorciatoie vere ----
async function mostraTasti() {
  const comandi = await chrome.commands.getAll();
  const tasto = (nome) => {
    const c = comandi.find((x) => x.name === nome);
    return c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc').replace(/BARRA SPAZIATRICE|Space/gi, 'Spazio') : '';
  };
  let mancano = false;
  for (const k of document.querySelectorAll('kbd[data-comando]')) {
    const t = tasto(k.dataset.comando);
    k.textContent = t || 'non impostata';
    k.classList.toggle('manca', !t);
    if (!t) mancano = true;
  }
  for (const el of document.querySelectorAll('[data-se-mancano]')) el.hidden = !mancano;
}
mostraTasti();
for (const b of document.querySelectorAll('[data-azione="scorciatoie"]'))
  b.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
for (const b of document.querySelectorAll('[data-azione="opzioni"]'))
  b.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
for (const b of document.querySelectorAll('[data-azione="dettatura"]'))
  b.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('dettatura.html') });
  });

// ---- stato della voce ----
const statoVoce = document.getElementById('statoVoce');
const barraVoce = document.getElementById('barraVoce');
function mostraVoce(s, inCache) {
  if (!statoVoce) return;
  const d = s && s.download;
  const riquadro = statoVoce.closest('.statoVoce');
  riquadro.classList.remove('pronto', 'attivo', 'errore');
  if (barraVoce) barraVoce.hidden = true;
  if (d && d.interrotto) {
    riquadro.classList.add('errore');
    statoVoce.textContent = 'Download della voce interrotto: riprende da solo, o dal pulsante di WebG Voice.';
  } else if (s && s.fase === 'consenso') {
    statoVoce.textContent = 'Sei su una connessione a consumo: la voce si scarica quando la chiedi dal pulsante di WebG Voice.';
  } else if (d && d.totale && !d.inAttesa && d.scaricati < d.totale) {
    riquadro.classList.add('attivo');
    statoVoce.textContent = `Sto scaricando la voce: ${Math.floor((100 * d.scaricati) / d.totale)}%, ${mb(d.scaricati)} di ${mb(d.totale)}. Puoi continuare a navigare.`;
    if (barraVoce) {
      barraVoce.hidden = false;
      barraVoce.value = d.scaricati / d.totale;
    }
  } else if (inCache || (s && s.motorePronto)) {
    riquadro.classList.add('pronto');
    statoVoce.textContent = 'La voce è sul computer: la lettura funziona anche offline.';
  } else {
    statoVoce.textContent = `La voce (${mb(BYTE_TOTALI)}) si scarica da sola in sottofondo, una volta sola.`;
  }
}
let inCache = false;
(async () => {
  try {
    inCache = await modelliInCache();
  } catch {}
  let r = null;
  try {
    r = await comando('stato');
  } catch {}
  mostraVoce(r && r.stato, inCache);
})();
chrome.runtime.onMessage.addListener((msg, mittente) => {
  if (mittente.id !== chrome.runtime.id) return;
  if (msg && msg.da === 'offscreen' && msg.tipo === 'stato') {
    if (msg.stato && msg.stato.motorePronto) inCache = true;
    mostraVoce(msg.stato, inCache);
    const prova = document.getElementById('prova');
    if (prova) {
      const f = msg.stato && msg.stato.fase;
      const inCorso = ['lettura', 'preparazione', 'pausa'].includes(f);
      prova.dataset.inCorso = String(inCorso);
      prova.querySelector('span').textContent = inCorso ? 'Ferma' : 'Ascolta questo paragrafo';
    }
  }
});

// ---- prova della lettura ----
const prova = document.getElementById('prova');
if (prova) {
  prova.addEventListener('click', async () => {
    if (prova.dataset.inCorso === 'true') return comando('stop');
    const testo = document.getElementById('testoProva').textContent.trim();
    prova.querySelector('span').textContent = 'Preparo la voce…';
    const r = await comando('leggiTesto', { testo });
    if (r && r.errore) prova.querySelector('span').textContent = r.errore;
  });
}

// ---- indice laterale della guida: la sezione in vista e' quella evidenziata ----
(() => {
  const voci = [...document.querySelectorAll('nav.indice ol a')];
  if (!voci.length || typeof IntersectionObserver !== 'function') return;
  const oss = new IntersectionObserver(
    (v) => {
      const vista = v.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vista) voci.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${vista.target.id}`)));
    },
    { rootMargin: '0px 0px -60% 0px' }
  );
  for (const a of voci) {
    const s = document.querySelector(a.getAttribute('href'));
    if (s) oss.observe(s);
  }
})();
