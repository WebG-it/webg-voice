import { modelliInCache, BYTE_TOTALI, VOCI, voceValida } from './lib/modelli.js';

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
const AVVISO_ARTICOLO = 'Non trovo un articolo in questa pagina: seleziona il testo da leggere oppure incollalo qui sopra.';
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

// ---- Voce: Sara o Nicola, ricordata in chrome.storage.local ----
let voce = 'sara';
const pulsantiVoce = [...document.querySelectorAll('.voci button')];
function mostraVoce(v) {
  voce = voceValida(v);
  for (const b of pulsantiVoce) {
    const scelta = b.dataset.voce === voce;
    b.setAttribute('aria-checked', String(scelta));
    b.tabIndex = scelta ? 0 : -1;
  }
}
async function scegliVoce(v) {
  if (voceValida(v) === voce) return;
  mostraVoce(v);
  await comando('voce', { valore: voce });
}
for (const b of pulsantiVoce) b.addEventListener('click', () => scegliVoce(b.dataset.voce));
// frecce come in un gruppo di pulsanti radio
$('etichettaVoce').parentElement.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const i = pulsantiVoce.findIndex((b) => b.dataset.voce === voce);
  const avanti = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  const b = pulsantiVoce[(i + (avanti ? 1 : pulsantiVoce.length - 1)) % pulsantiVoce.length];
  scegliVoce(b.dataset.voce);
  b.focus();
});

function mostra(s) {
  fase = s ? s.fase : 'inattivo';
  etichettaPlay(fase);
  stop.disabled = !(s && ['lettura', 'pausa', 'preparazione'].includes(s.fase));
  statoBox.classList.remove('errore');
  barraDl.hidden = mb.hidden = true;
  scarica.hidden = rifiuta.hidden = true;
  const d = s && s.download;
  const dv = s && s.downloadVoce;
  mostraMp3(s && s.mp3);

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
  } else if (dv && dv.totale) {
    statoTesto.textContent = `Scarico la voce ${VOCI[voceValida(dv.voce)].nome}, una volta sola…`;
    barra(dv);
  } else if (d && d.avvio) {
    statoTesto.textContent = 'Avvio il motore di sintesi…';
  } else if (s && s.fase === 'preparazione') {
    statoTesto.textContent = s.titolo ? `Preparo l'articolo: ${s.titolo}` : 'Preparo la lettura…';
  } else if (s && s.fase === 'lettura') {
    const parte = s.totale > 1 ? `, parte ${Math.min(s.blocco + 1, s.totale)} di ${s.totale}` : '';
    statoTesto.textContent = s.titolo ? `In lettura${parte}: ${s.titolo}` : `In lettura${parte}`;
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

// ---- MP3 ----
const mp3Box = $('mp3Box');
const mp3Salva = $('mp3Salva');
const durata = (sec) => {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
};
const peso = (b) => `${(b / 1e6).toFixed(1).replace('.', ',')} MB`;
let richiestoMp3 = false;
let salvatoQui = null;

function mostraMp3(m) {
  const box = mp3Box;
  if (!m) {
    box.hidden = !richiestoMp3;
    return;
  }
  richiestoMp3 = false;
  box.hidden = false;
  box.classList.toggle('errore', m.fase === 'errore');
  const barraMp3 = $('mp3Barra');
  const lavora = ['preparazione', 'sintesi', 'codifica'].includes(m.fase);
  $('mp3Annulla').hidden = !lavora;
  $('mp3Chiudi').hidden = lavora;
  mp3Salva.hidden = m.fase !== 'pronto';
  barraMp3.hidden = !lavora;
  $('mp3Dettaglio').hidden = false;
  $('mp3Barra').value = m.totale ? m.fatti / m.totale : 0;
  if (m.fase === 'preparazione') {
    $('mp3Testo').textContent = `Preparo l'MP3: ${m.nomeFile}`;
    $('mp3Dettaglio').textContent = 'Puoi chiudere questo pannello: il file si salva quando lo riapri.';
  } else if (m.fase === 'sintesi') {
    const pct = m.totale ? Math.floor((100 * m.fatti) / m.totale) : 0;
    $('mp3Testo').textContent = `Creo l'MP3: ${pct}%`;
    $('mp3Dettaglio').textContent = `${m.nomeFile} · ${durata(m.secondi)} di audio finora`;
  } else if (m.fase === 'codifica') {
    $('mp3Testo').textContent = 'Ultimo passaggio…';
    $('mp3Dettaglio').textContent = m.nomeFile;
  } else if (m.fase === 'pronto') {
    $('mp3Testo').textContent = m.salvato ? 'MP3 salvato nella cartella dei download.' : 'MP3 pronto, lo salvo…';
    $('mp3Dettaglio').textContent = `${m.nomeFile} · ${durata(m.secondi)} · ${peso(m.byte)}`;
    mp3Salva.href = m.url;
    mp3Salva.download = m.nomeFile;
    if (!m.salvato && salvatoQui !== m.url) {
      // salvataggio automatico, una volta sola: il file l'ha chiesto l'utente con "Scarica MP3"
      salvatoQui = m.url;
      mp3Salva.click();
      comando('mp3Salvato');
    }
  } else if (m.fase === 'errore') {
    $('mp3Testo').textContent = `MP3 non creato: ${m.errore}`;
    $('mp3Dettaglio').hidden = true;
  }
}

$('mp3').addEventListener('click', async () => {
  avvisoPagina('');
  const t = testo.value.trim();
  richiestoMp3 = true;
  mp3Box.hidden = false;
  $('mp3Testo').textContent = t ? 'Preparo l\'MP3…' : 'Cerco il testo nella pagina…';
  $('mp3Dettaglio').textContent = '';
  $('mp3Annulla').hidden = true;
  $('mp3Chiudi').hidden = mp3Salva.hidden = true;
  const r = await comando('mp3', t ? { testo: t } : {});
  if (r && r.avviato) return;
  richiestoMp3 = false;
  mp3Box.hidden = true;
  const motivo = r && r.motivo;
  if (motivo === 'protetta') avvisoPagina(AVVISO_PROTETTA);
  else avvisoPagina('Per creare un MP3 incolla un testo qui sopra, seleziona del testo nella pagina o apri un articolo.');
  testo.focus();
});
$('mp3Annulla').addEventListener('click', () => {
  richiestoMp3 = false;
  comando('annullaMp3');
});
$('mp3Chiudi').addEventListener('click', () => {
  richiestoMp3 = false;
  mp3Box.hidden = true;
  comando('chiudiMp3');
});

play.addEventListener('click', async () => {
  if (fase === 'lettura' || fase === 'preparazione') return comando('pausa');
  if (fase === 'pausa') return comando('riprendi');
  const t = testo.value.trim();
  if (t) {
    avvisoPagina('');
    return comando('leggiTesto', { testo: t });
  }
  // campo vuoto: si legge il testo selezionato nella scheda attiva, altrimenti l'articolo
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
  avvisoPagina(r && r.nessunArticolo ? 'Non trovo testo selezionato né un articolo in questa pagina: incolla un testo qui sopra o seleziona quello da leggere.' : 'Incolla un testo qui sopra, oppure seleziona del testo nella pagina e premi Leggi.');
  testo.focus();
});
$('articolo').addEventListener('click', async () => {
  avvisoPagina('');
  const r = await comando('leggiArticolo');
  if (r && r.letto) return;
  avvisoPagina(r && r.motivo === 'protetta' ? AVVISO_PROTETTA : AVVISO_ARTICOLO);
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
  const [{ bozza, voce: voceScelta }, comandi] = await Promise.all([chrome.storage.local.get(['bozza', 'voce']), chrome.commands.getAll()]);
  if (bozza) testo.value = bozza;
  mostraVoce(voceScelta);
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
  // il motore si prepara mentre l'utente sceglie cosa leggere
  if (inCache && !(r && r.stato && r.stato.motorePronto)) comando('prerisc');
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

// ---- Dettatura ----
async function mostraDettatura(s) {
  const attiva = s && ['preparazione', 'ascolto', 'parlato', 'trascrivo'].includes(s.fase);
  $('detta').classList.toggle('attiva', !!attiva);
  $('detta').querySelector('span').textContent = attiva ? 'Ferma' : 'Detta';
  if (s && s.fase === 'preparazione' && s.download && s.download.totale) $('dettaStato').textContent = `Scarico il modello: ${Math.floor((100 * s.download.scaricati) / s.download.totale)}%`;
  else if (attiva) $('dettaStato').textContent = 'Ti ascolto…';
  else if (s && s.fase === 'errore') $('dettaStato').textContent = s.errore || 'Errore nella dettatura';
}
$('detta').addEventListener('click', async () => {
  const r = await comando('dettaturaAlterna');
  if (r && r.motivo === 'protetta') $('dettaStato').textContent = 'Chrome non permette di dettare su questa pagina.';
  else if (r && r.avviata) window.close();
});
$('dettaOpzioni').addEventListener('click', (e) => {
  e.preventDefault();
  comando('dettaturaApri');
  window.close();
});
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.da === 'offscreen' && m.tipo === 'statoDettatura') mostraDettatura(m.stato);
});
(async () => {
  const c = (await chrome.commands.getAll()).find((x) => x.name === 'dettatura');
  if (c && c.shortcut) $('tastoDetta').textContent = c.shortcut.replace(/Shift/g, 'Maiusc');
  try {
    const r = await comando('dettaturaStato');
    if (r && r.stato) mostraDettatura(r.stato);
  } catch {}
})();
