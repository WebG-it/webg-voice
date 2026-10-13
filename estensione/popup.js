import { modelliInCache, BYTE_TOTALI } from './lib/modelli.js';

const $ = (id) => document.getElementById(id);
const testo = $('testo');
const play = $('play');
const stop = $('stop');
const vel = $('vel');
const velVal = $('velVal');
const statoBox = $('statoBox');
const statoTesto = $('statoTesto');
const barraDl = $('barraDl');
const mb = $('mb');
const scarica = $('scarica');
const rifiuta = $('rifiuta');

const manifest = chrome.runtime.getManifest();
$('nome').textContent = manifest.short_name || manifest.name;
$('versione').textContent = `v${manifest.version}`;
document.title = manifest.short_name || manifest.name;

const MB = (b) => `${Math.round(b / 1e6)} MB`;
const fmt = (v) => `${Number(v).toFixed(2).replace('.', ',')}×`;
const comando = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra });

let fase = 'inattivo';
let inCache = false;

const ICONE = {
  pausa: '<rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/>',
  play: '<path d="M5 3.2v9.6c0 .6.6.9 1.1.6l7.4-4.8c.5-.3.5-.9 0-1.2L6.1 2.6C5.6 2.3 5 2.6 5 3.2z"/>',
};

function etichettaPlay(f) {
  const [icona, label] = {
    lettura: [ICONE.pausa, 'Pausa'],
    preparazione: [ICONE.pausa, 'Pausa'],
    pausa: [ICONE.play, 'Riprendi'],
  }[f] || [ICONE.play, 'Leggi'];
  play.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${icona}</svg><span>${label}</span>`;
  play.title = label;
}

function barra(d) {
  barraDl.hidden = mb.hidden = false;
  barraDl.value = d.scaricati / d.totale;
  mb.textContent = `${Math.floor((100 * d.scaricati) / d.totale)}% · ${MB(d.scaricati)} di ${MB(d.totale)}`;
}

function mostra(s) {
  fase = s ? s.fase : 'inattivo';
  etichettaPlay(fase);
  stop.disabled = !(s && ['lettura', 'pausa', 'preparazione'].includes(s.fase));
  statoBox.classList.remove('errore');
  barraDl.hidden = mb.hidden = true;
  scarica.hidden = rifiuta.hidden = true;
  const d = s && s.download;

  if (s && s.fase === 'consenso') {
    const gia = d && d.scaricati ? ` Ne hai già ${MB(d.scaricati)}: riprende da lì.` : '';
    statoTesto.textContent = `Per leggere serve scaricare la voce, circa ${MB(BYTE_TOTALI)}, una volta sola. Poi funziona anche offline.${gia}`;
    scarica.textContent = 'Scarica';
    scarica.hidden = rifiuta.hidden = false;
  } else if (d && d.interrotto) {
    statoBox.classList.add('errore');
    statoTesto.textContent = s.errore;
    barra(d);
    scarica.textContent = 'Riprova';
    scarica.hidden = false;
  } else if (s && s.errore) {
    statoBox.classList.add('errore');
    statoTesto.textContent = `Errore: ${s.errore}`;
  } else if (d && d.totale && !d.inAttesa && d.scaricati < d.totale) {
    statoTesto.textContent = d.riprovo
      ? `Connessione interrotta, riprovo (tentativo ${d.riprovo})…`
      : `Primo avvio: scarico la voce da ${d.fonte || 'internet'}. Poi resta sul computer e funziona offline.`;
    barra(d);
  } else if (d && d.avvio) {
    statoTesto.textContent = 'Avvio il motore di sintesi…';
  } else if (s && s.fase === 'preparazione') {
    statoTesto.textContent = 'Preparo la lettura…';
  } else if (s && s.fase === 'lettura') {
    statoTesto.textContent = s.totale > 1 ? `In lettura, parte ${Math.min(s.blocco + 1, s.totale)} di ${s.totale}` : 'In lettura';
  } else if (s && s.fase === 'pausa') {
    statoTesto.textContent = 'In pausa';
  } else if (inCache || (s && s.motorePronto)) {
    statoTesto.textContent = 'Voce pronta, funziona anche offline.';
  } else {
    statoTesto.textContent = `La voce si scarica una volta sola (circa ${MB(BYTE_TOTALI)}), poi resta sul computer e funziona offline.`;
    scarica.textContent = 'Scarica la voce adesso';
    scarica.hidden = false;
  }
}

play.addEventListener('click', async () => {
  if (fase === 'lettura' || fase === 'preparazione') return comando('pausa');
  if (fase === 'pausa') return comando('riprendi');
  const t = testo.value.trim();
  if (t) return comando('leggiTesto', { testo: t });
  // campo vuoto: si legge il testo selezionato nella scheda attiva
  // (aprire il popup concede activeTab su quella scheda)
  const r = await comando('leggiSelezioneAttiva');
  if (r && r.letto) return;
  statoTesto.textContent = 'Incolla un testo qui sopra, oppure seleziona del testo nella pagina e premi Leggi.';
  testo.focus();
});
stop.addEventListener('click', () => comando('stop'));
scarica.addEventListener('click', () => {
  scarica.hidden = rifiuta.hidden = true;
  statoTesto.textContent = 'Avvio il download…';
  comando(fase === 'consenso' ? 'consenti' : 'preparaMotore');
});
rifiuta.addEventListener('click', () => comando('rifiuta'));

let invio = null;
vel.addEventListener('input', () => {
  velVal.textContent = fmt(vel.value);
  clearTimeout(invio);
  invio = setTimeout(() => comando('velocita', { valore: Number(vel.value) }), 250);
});

// Bozza del testo incollato, cosi' non si perde chiudendo il popup
testo.addEventListener('input', () => chrome.storage.local.set({ bozza: testo.value }));

$('tasti').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
$('diagnostica').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.da === 'offscreen' && msg.tipo === 'stato') {
    if (msg.stato.motorePronto) inCache = true;
    mostra(msg.stato);
  }
});

(async () => {
  const [{ bozza }, comandi] = await Promise.all([chrome.storage.local.get('bozza'), chrome.commands.getAll()]);
  if (bozza) testo.value = bozza;
  const c = comandi.find((x) => x.name === 'leggi-selezione');
  $('tasto').textContent = c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc') : 'non assegnata';
  try {
    inCache = await modelliInCache();
  } catch {
    inCache = false;
  }
  const r = await comando('stato');
  if (r && typeof r.velocita === 'number') {
    vel.value = r.velocita;
    velVal.textContent = fmt(r.velocita);
  }
  mostra(r && r.stato);
})();
