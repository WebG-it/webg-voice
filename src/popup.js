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
const NOME = chrome.i18n.getMessage('nomeEstensione');
$('nome').textContent = NOME;
$('versione').textContent = `v${manifest.version}`;
document.title = NOME;

const MB = (b) => `${Math.round(b / 1e6)} MB`;
const fmt = (v) => `${Number(v).toFixed(2).replace('.', ',')}×`;
const comando = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra });

let fase = 'inattivo';
const AVVISO_PROTETTA = 'Chrome non permette la lettura su questa pagina: incolla qui sopra il testo e premi Leggi.';
// avviso che resta visibile anche mentre lo stato (es. il download) si aggiorna
function avvisoPagina(t) {
  $('avvisoPagina').textContent = t;
  $('avvisoPagina').hidden = !t;
}
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
    statoTesto.textContent = `Sei su una connessione a consumo: la voce (circa ${MB(BYTE_TOTALI)}, una volta sola) si scarica solo se lo chiedi.${gia}`;
    scarica.textContent = 'Scarica';
    scarica.hidden = rifiuta.hidden = false;
  } else if (d && d.interrotto) {
    statoBox.classList.add('errore');
    statoTesto.textContent = s.errore;
    barra(d);
    scarica.textContent = 'Riprova';
    scarica.hidden = false;
  } else if (d && d.riprovoTra) {
    statoTesto.textContent = `Connessione interrotta: riprovo da solo fra ${d.riprovoTra} secondi.`;
    if (d.totale) barra(d);
  } else if (s && s.errore) {
    statoBox.classList.add('errore');
    statoTesto.textContent = `Errore: ${s.errore}`;
  } else if (d && d.totale && !d.inAttesa && d.scaricati < d.totale) {
    statoTesto.textContent = d.riprovoTra
      ? `Connessione interrotta: riprovo da solo fra ${d.riprovoTra} secondi.`
      : d.riprovo
        ? `Connessione instabile, riprovo (tentativo ${d.riprovo})…`
        : `Primo avvio: scarico il modello vocale, una volta sola. Poi funziona anche offline.`;
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
    statoTesto.textContent = `Il modello vocale (circa ${MB(BYTE_TOTALI)}) non è ancora sul computer: si scarica una volta sola, poi funziona offline.`;
    scarica.textContent = 'Scarica adesso';
    scarica.hidden = false;
  }
}

play.addEventListener('click', async () => {
  if (fase === 'lettura' || fase === 'preparazione') return comando('pausa');
  if (fase === 'pausa') return comando('riprendi');
  const t = testo.value.trim();
  if (t) {
    avvisoPagina('');
    return comando('leggiTesto', { testo: t });
  }
  // campo vuoto: si legge il testo selezionato nella scheda attiva
  // (aprire il popup concede activeTab su quella scheda)
  const r = await comando('leggiSelezioneAttiva');
  if (r && r.letto) return;
  if (r && r.protetta) {
    avvisoPagina(AVVISO_PROTETTA);
    testo.focus();
    return;
  }
  if (r && r.riquadri && r.riquadri.length) {
    // testo forse in un riquadro di un altro sito (es. editor incorporati): serve un permesso in piu',
    // chiesto ora e solo per quei siti
    const host = r.riquadri.map((o) => new URL(o).host).join(', ');
    statoTesto.textContent = `Non trovo testo selezionato. Se è dentro un riquadro di ${host}, consenti la lettura lì e premi di nuovo Leggi.`;
    const b = $('riquadri');
    b.hidden = false;
    b.onclick = async () => {
      const ok = await chrome.permissions.request({ origins: r.riquadri.map((o) => `${o}/*`) });
      b.hidden = true;
      if (ok) comando('leggiSelezioneAttiva');
    };
    return;
  }
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

const apriScorciatoie = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); // solo su clic dell'utente
};
$('tasti').addEventListener('click', apriScorciatoie);
$('tastiAvviso').addEventListener('click', apriScorciatoie);

chrome.runtime.onMessage.addListener((msg, mittente) => {
  if (mittente.id !== chrome.runtime.id) return;
  if (msg && msg.da === 'offscreen' && msg.tipo === 'stato') {
    if (msg.stato.motorePronto) inCache = true;
    mostra(msg.stato);
  }
});

(async () => {
  const [{ bozza }, comandi] = await Promise.all([chrome.storage.local.get('bozza'), chrome.commands.getAll()]);
  if (bozza) testo.value = bozza;
  // scorciatoie lette da Chrome: restano giuste anche se l'utente le cambia
  const tasto = (nome) => {
    const c = comandi.find((x) => x.name === nome);
    return c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc') : 'non assegnata';
  };
  $('tasto').textContent = tasto('leggi-selezione');
  $('tastoStop').textContent = tasto('ferma-lettura');
  // Chrome lascia la scorciatoia vuota se e' gia' usata da un'altra estensione
  $('avvisoTasto').hidden = tasto('leggi-selezione') !== 'non assegnata';
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
  // riscontro di una scorciatoia o di un menu andati a vuoto poco fa su questa scheda
  try {
    const { avviso } = await chrome.storage.session.get('avviso');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (avviso && Date.now() - avviso.quando < 120000 && (!tab || avviso.tabId === tab.id)) {
      avvisoPagina(avviso.motivo === 'protetta' ? AVVISO_PROTETTA : avviso.titolo);
      await chrome.storage.session.remove('avviso');
    }
  } catch {}
})();
