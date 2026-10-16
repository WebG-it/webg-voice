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
const AVVISO_PROTETTA = 'Chrome non permette la lettura su questa pagina: usa «Leggi un testo incollato».';
const AVVISO_ARTICOLO = 'Non trovo un articolo qui: seleziona il testo, oppure usa «Leggi un testo incollato».';
const incolla = $('incolla');
/** Testo incollato, solo se la sezione e' aperta. */
const testoIncollato = () => (incolla.open ? testo.value.trim() : '');
function apriIncolla() {
  incolla.open = true;
  testo.focus();
}
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
  const [icona, label, sotto] = {
    lettura: [ICONE.pausa, 'Pausa', 'in lettura'],
    preparazione: [ICONE.pausa, 'Pausa', 'preparo…'],
    pausa: [ICONE.play, 'Riprendi', 'in pausa'],
  }[f] || [ICONE.play, 'Leggi', 'selezione o pagina'];
  play.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${icona}</svg><span class="etichetta">${label}</span><span class="sotto">${sotto}</span>`;
  play.title = f === 'lettura' || f === 'pausa' || f === 'preparazione' ? label : "Legge la selezione, o l'articolo della pagina se non c'è selezione";
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
  // Ferma accanto a Leggi solo quando c'e' qualcosa da fermare
  stop.hidden = !(s && ['lettura', 'pausa', 'preparazione'].includes(s.fase));
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
        : 'Primo avvio: scarico la voce, una volta sola.';
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
    statoTesto.textContent = s.avvisoMotore
      ? s.avvisoMotore
      : s.riserva
      ? 'Il computer è occupato: preparo un po\' di voce in anticipo, riprendo fra poco.'
      : s.titolo
        ? `In lettura${parte}: ${s.titolo}`
        : `In lettura${parte}`;
  } else if (s && s.fase === 'pausa') {
    statoTesto.textContent = 'In pausa';
  } else if (inCache || (s && s.motorePronto)) {
    statoTesto.textContent = 'Voce pronta, anche offline.';
  } else {
    statoTesto.textContent = `La voce (${MB(BYTE_TOTALI)}) non è ancora sul computer: si scarica una volta sola.`;
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
  const t = testoIncollato();
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
  else avvisoPagina('Per l\'MP3 seleziona del testo, apri un articolo o incolla un testo.');
  apriIncolla();
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

$('leggiIncollato').addEventListener('click', () => {
  const t = testo.value.trim();
  if (!t) return testo.focus();
  avvisoPagina('');
  comando('leggiTesto', { testo: t });
});
play.addEventListener('click', async () => {
  if (fase === 'lettura' || fase === 'preparazione') return comando('pausa');
  if (fase === 'pausa') return comando('riprendi');
  avvisoPagina('');
  // campo vuoto: si legge il testo selezionato nella scheda attiva, altrimenti l'articolo
  // (aprire il popup concede activeTab su quella scheda)
  const r = await comando('leggiSelezioneAttiva');
  if (r && r.letto) return;
  if (r && r.protetta) {
    avvisoPagina(AVVISO_PROTETTA);
    apriIncolla();
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
  avvisoPagina(r && r.nessunArticolo ? 'Niente selezione né articolo qui: seleziona il testo o incollalo.' : 'Seleziona il testo da leggere, oppure incollalo.');
  apriIncolla();
});
// ---- Rileggi la bozza: lettura lenta e ripetizioni vicine ----
$('rileggi').addEventListener('click', async () => {
  avvisoPagina('');
  const t = testoIncollato();
  const box = $('bozzaBox');
  const lista = $('bozzaLista');
  lista.textContent = '';
  box.hidden = false;
  $('bozzaTesto').textContent = 'Preparo la rilettura…';
  const r = await comando('rileggi', t ? { testo: t } : {});
  if (!r || !r.avviato) {
    box.hidden = true;
    avvisoPagina(
      r && r.motivo === 'protetta'
        ? AVVISO_PROTETTA
        : 'Per rileggere una bozza selezionala nella pagina o nell\'editor, oppure incollala.'
    );
    return;
  }
  const rip = r.ripetizioni || [];
  $('bozzaTesto').textContent = rip.length
    ? `Rileggo più lenta (${fmt(r.velocita)}). Parole ripetute vicine:`
    : `Rileggo più lenta (${fmt(r.velocita)}). Nessuna parola ripetuta a poche frasi di distanza.`;
  for (const g of rip) {
    const li = document.createElement('li');
    li.textContent = g.parole.join(', ');
    const v = document.createElement('span');
    v.className = 'volte';
    v.textContent = ` ${g.volte} volte`;
    li.append(v);
    lista.append(li);
  }
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
$('tastiAvviso').addEventListener('click', apriScorciatoie);
$('impostazioni').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
// la sezione del testo incollato resta come l'utente l'ha lasciata
incolla.addEventListener('toggle', () => chrome.storage.local.set({ incollaAperto: incolla.open }));

chrome.runtime.onMessage.addListener((msg, mittente) => {
  if (mittente.id !== chrome.runtime.id) return;
  if (msg && msg.da === 'offscreen' && msg.tipo === 'stato') {
    if (msg.stato.motorePronto) inCache = true;
    mostra(msg.stato);
  }
});

(async () => {
  const [{ bozza, voce: voceScelta, incollaAperto }, comandi] = await Promise.all([chrome.storage.local.get(['bozza', 'voce', 'incollaAperto']), chrome.commands.getAll()]);
  if (bozza) testo.value = bozza;
  incolla.open = !!incollaAperto;
  mostraVoce(voceScelta);
  // scorciatoie lette da Chrome: restano giuste anche se l'utente le cambia
  mostraTasti(comandi);
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

// ---- Scorciatoie sempre in vista: i tasti veri di Chrome, o "non impostata · Sistema" ----
function mostraTasti(comandi) {
  const tasto = (nome) => {
    const c = comandi.find((x) => x.name === nome);
    return c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc').replace(/BARRA SPAZIATRICE|Space/gi, 'Spazio') : '';
  };
  const mancanti = [];
  const mostra = (box, nome, dopo, etichetta) => {
    const t = tasto(nome);
    box.textContent = '';
    if (t) {
      const k = document.createElement('kbd');
      k.textContent = t;
      box.append(k);
      if (dopo) box.append(` ${dopo}`);
      return t;
    }
    mancanti.push(etichetta);
    const s = document.createElement('span');
    s.className = 'manca';
    s.textContent = etichetta === 'Ferma' ? 'Ferma non impostata · ' : 'non impostata · ';
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Sistema';
    a.addEventListener('click', apriScorciatoie);
    box.append(s, a);
    return '';
  };
  mostra($('tastoLeggi'), 'leggi-selezione', '', 'Leggi');
  mostra($('tastoFerma'), 'ferma-lettura', 'ferma', 'Ferma');
  const td = mostra($('tastoDettaBox'), 'dettatura', 'tieni premuto', 'Detta');
  if (td) tastoDettatura = td;
  // il problema si vede gia' sotto il pulsante ("non impostata · Sistema"): il motivo nel suggerimento
  for (const id of ['tastoLeggi', 'tastoFerma', 'tastoDettaBox']) {
    $(id).title = $(id).querySelector('.manca') ? "Scorciatoia non impostata: di solito un'altra estensione usa gli stessi tasti. Sistema apre le scorciatoie di Chrome." : '';
  }
  $('avvisoTasto').hidden = true;
}

// ---- Dettatura ----
let dettPronta = null; // modello della dettatura sul computer?
let tastoDettatura = 'Ctrl+Spazio';
async function mostraDettatura(s) {
  const attiva = s && ['preparazione', 'ascolto', 'parlato', 'trascrivo'].includes(s.fase);
  const d = s && s.download;
  const scarica = !!(d && d.totale > 1 && !d.avvio && d.scaricati < d.totale);
  if (s && s.info && !d) dettPronta = true;
  $('detta').classList.toggle('attiva', !!attiva);
  $('detta').querySelector('.etichetta').textContent = attiva ? 'Ferma' : 'Detta';
  // mentre il modello si scarica (fuori da una dettatura) il pulsante aspetta
  $('detta').disabled = scarica && !attiva;
  let t;
  let titolo = 'Detta nel campo dove hai il cursore';
  if (scarica) {
    t = `scarico ${Math.floor((100 * d.scaricati) / d.totale)}%`;
    titolo = 'Dettatura non ancora pronta: il modello si sta scaricando, una volta sola';
  } else if (s && s.fase === 'preparazione') t = 'preparo…';
  else if (attiva) t = 'ti ascolto';
  else if (s && s.fase === 'errore') {
    t = 'errore';
    titolo = s.errore || 'Errore nella dettatura';
    avvisoPagina(titolo);
  } else if (dettPronta) t = 'pronta';
  else if (dettPronta === false) {
    t = 'si prepara al primo uso';
    titolo = 'Il modello si scarica da solo alla prima dettatura, una volta sola';
  }
  if (t !== undefined) $('dettaStato').textContent = t;
  $('detta').title = titolo;
}
$('detta').addEventListener('click', async () => {
  const r = await comando('dettaturaAlterna');
  if (r && r.motivo === 'protetta') $('dettaStato').textContent = 'Chrome non permette di dettare su questa pagina.';
  else if (r && r.avviata) window.close();
});
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.da === 'offscreen' && m.tipo === 'statoDettatura') mostraDettatura(m.stato);
});
(async () => {
  try {
    const { dettModello } = await chrome.storage.local.get('dettModello');
    const p = await comando('dettaturaPronto', { modello: dettModello || 'normale' });
    dettPronta = !!(p && p.completo);
    const r = await comando('dettaturaStato');
    mostraDettatura(r && r.stato);
  } catch {}
})();

