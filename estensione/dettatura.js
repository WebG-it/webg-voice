// Pagina della dettatura: primo uso (microfono, misura del computer, scelta e download del
// modello), prova, dizionario e opzioni. Si apre da sola alla prima Alt+S.

import { MODELLI_DETTATURA, modelloDettaturaValido, byteModello } from './lib/modelli-dettatura.js';
import { creaSessione } from './lib/pulizia.js';

const $ = (s) => document.querySelector(s);
const manda = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra });
const mb = (b) => `${Math.round(b / 1e6)} MB`;
const sec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

// ---------- 1. microfono ----------
let permesso = 'prompt';
async function controllaMicrofono() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    permesso = p.state;
    p.onchange = () => {
      permesso = p.state;
      mostraMicrofono();
    };
  } catch {}
  mostraMicrofono();
}
function mostraMicrofono() {
  const stato = $('#micStato');
  $('#micConsenti').hidden = permesso === 'granted';
  $('#micAiuto').hidden = permesso !== 'denied';
  stato.textContent =
    permesso === 'granted'
      ? 'Consentito. Il microfono si accende solo mentre detti (lo vedi dal pallino rosso nella pagina) e si spegne quando finisci.'
      : permesso === 'denied'
        ? 'Bloccato.'
        : 'Serve il permesso di usare il microfono: Chrome lo chiede una volta sola.';
}
$('#micConsenti').addEventListener('click', async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of s.getTracks()) t.stop();
    permesso = 'granted';
  } catch (e) {
    permesso = /NotAllowed|Permission/i.test(String(e && e.name)) ? 'denied' : permesso;
    if (/NotFound/i.test(String(e && e.name))) $('#micStato').textContent = 'Non trovo un microfono collegato.';
  }
  mostraMicrofono();
});

// ---------- 2. modello ----------
let scelto = 'normale';
let pronti = {};
const radio = () => [...document.querySelectorAll('input[name="modello"]')];

async function aggiornaPronti() {
  for (const id of Object.keys(MODELLI_DETTATURA)) {
    try {
      const r = await manda('dettaturaPronto', { modello: id });
      pronti[id] = !!(r && r.completo);
    } catch {
      pronti[id] = false;
    }
  }
  mostraModello();
}

function mostraModello() {
  for (const r of radio()) {
    r.checked = r.value === scelto;
    const etichetta = r.closest('label').querySelector('.dim');
    etichetta.textContent = pronti[r.value] ? 'sul computer' : mb(byteModello(r.value));
  }
  $('#scarica').textContent = pronti[scelto] ? 'Usa questo e prova' : `Scarica (${mb(byteModello(scelto))}) e prova`;
  $('#cancella').hidden = !pronti[scelto];
}

for (const r of radio()) {
  r.addEventListener('change', async () => {
    scelto = r.value;
    await chrome.storage.local.set({ dettModello: scelto });
    mostraModello();
  });
}

/** Proposta dal confronto con il computer di sviluppo (dove il modello Normale sta sotto il secondo e mezzo). */
async function misuraComputer() {
  const p = $('#misuraPC');
  // la misura si fa una volta (a computer tranquillo, prima di scaricare), poi si riusa:
  // ripeterla mentre il computer lavora darebbe una proposta sbagliata
  const { dettMisuraPC: salvata } = await chrome.storage.local.get('dettMisuraPC');
  let cpu;
  let gpu;
  if (salvata && salvata.cpu && Date.now() - salvata.quando < 30 * 86400000) ({ cpu, gpu } = salvata);
  else {
    let m;
    try {
      m = await manda('dettaturaMisuraPC');
    } catch (e) {
      p.textContent = `Misura non riuscita: ${e.message || e}`;
      return;
    }
    cpu = m && m.wasm && m.wasm.gflops;
    gpu = m && m.webgpu && m.webgpu.disponibile ? m.webgpu.gflops : null;
    await chrome.storage.local.set({ dettMisuraPC: { cpu, gpu, quando: Date.now() } });
  }
  const qRadio = radio().find((r) => r.value === 'qualita');
  qRadio.disabled = !gpu;
  if (!gpu) qRadio.closest('label').title = 'Questo computer non offre WebGPU a Chrome';
  let proposta = 'normale';
  // soglie: vedi test/dettatura/banco.mjs e il CHANGELOG della 1.3.0
  if (!cpu || cpu < SOGLIA_CPU) proposta = 'leggero';
  const { dettModello } = await chrome.storage.local.get('dettModello');
  scelto = dettModello ? modelloDettaturaValido(dettModello) : proposta;
  if (!dettModello) await chrome.storage.local.set({ dettModello: scelto });
  p.textContent = `Processore: ${cpu ? cpu.toFixed(0) + ' GFLOPS' : 'non misurato'}${gpu ? `; scheda video: ${gpu.toFixed(0)} GFLOPS (WebGPU)` : '; WebGPU non disponibile'}.`;
  const v = $('#proposta');
  v.hidden = false;
  v.className = 'verdetto ok';
  v.textContent =
    proposta === 'leggero'
      ? 'Proposta: Leggero. Il processore di questo computer è lento per il modello Normale.'
      : gpu && gpu >= SOGLIA_GPU
        ? 'Proposta: Normale. La scheda video regge anche Qualità, se vuoi il riconoscimento più preciso.'
        : 'Proposta: Normale.';
  mostraModello();
}
// GFLOPS della moltiplicazione 512x768x768 in WebAssembly sotto cui il modello Normale supera
// i 2,5 secondi per frase (proporzione sul PC di sviluppo); scheda video sotto cui Qualita' non conviene
const SOGLIA_CPU = 45;
const SOGLIA_GPU = 40;

let scaricando = false;
$('#scarica').addEventListener('click', async () => {
  if (scaricando) return;
  scaricando = true;
  $('#scarica').disabled = true;
  $('#barra').hidden = false;
  $('#modelloStato').textContent = pronti[scelto] ? 'Carico il modello…' : 'Scarico il modello…';
  await chrome.storage.local.set({ dettModello: scelto });
  const r = await manda('dettaturaScarica', { modello: scelto });
  scaricando = false;
  $('#scarica').disabled = false;
  $('#barra').hidden = true;
  if (!r || !r.ok) {
    $('#modelloStato').textContent = `Non riuscito: ${(r && r.errore) || 'errore sconosciuto'}. Premi di nuovo: il download riparte da dove si era fermato.`;
    return;
  }
  pronti[scelto] = true;
  mostraModello();
  // dalla fine del parlato al testo: 360 ms di attesa della pausa, poi la trascrizione
  const stima = 360 + r.misura.ms;
  await chrome.storage.local.set({ dettMisura: { modello: scelto, ms: r.misura.ms, stima, quando: Date.now(), ep: r.misura.ep } });
  let testo = `Pronto. Una frase di 4 secondi diventa testo circa ${sec(stima)} dopo che hai smesso di parlare.`;
  if (r.info && r.info.finestraVariabile === false) testo += ' (Versione veloce del modello non raggiungibile: uso quella completa, più lenta.)';
  if (stima > 2500 && scelto !== 'leggero') testo += ' È lento su questo computer: prova il modello Leggero.';
  $('#modelloStato').textContent = testo;
});

$('#cancella').addEventListener('click', async () => {
  await manda('dettaturaCancella', { modello: scelto });
  pronti[scelto] = false;
  mostraModello();
  $('#modelloStato').textContent = 'Eliminato dal computer.';
});

// avanzamento del download (lo stato arriva dall'offscreen a tutte le pagine dell'estensione)
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.da === 'offscreen' && m.tipo === 'statoDettatura') {
    const d = m.stato.download;
    if (d && d.totale) {
      $('#barra').hidden = false;
      $('#barra').value = d.scaricati / d.totale;
      $('#modelloStato').textContent = `Scarico il modello: ${mb(d.scaricati)} di ${mb(d.totale)}${d.fonte ? ` da ${d.fonte}` : ''}…`;
    } else if (d && d.avvio) $('#modelloStato').textContent = 'Avvio il modello e misuro la velocità…';
    mostraProva(m.stato);
  }
});

// ---------- 3. prova in questa pagina ----------
let sessione = null;
const area = $('#provaTesto');
function mostraProva(s) {
  const t = {
    preparazione: 'Preparo…',
    ascolto: 'Ti ascolto: parla pure.',
    parlato: 'Ti ascolto…',
    trascrivo: 'Scrivo…',
    inattiva: '',
    errore: s.errore || 'Errore',
  };
  if (s.fase in t && (sessione || s.fase === 'errore')) $('#provaStato').textContent = s.fase === 'ascolto' && s.inCoda ? 'Scrivo…' : t[s.fase];
  $('#dettaQui').textContent = ['preparazione', 'ascolto', 'parlato', 'trascrivo'].includes(s.fase) ? 'Ferma' : 'Detta qui';
}
$('#dettaQui').addEventListener('click', async () => {
  area.focus();
  const r = await manda('dettaturaAvviaQui');
  if (r && r.motivo === 'primoUso') {
    $('#provaStato').textContent = r.permesso !== 'granted' ? 'Prima consenti il microfono (passo 1).' : 'Prima scarica il modello (passo 2).';
  }
});
function inserisci(testo) {
  area.focus();
  if (!document.execCommand('insertText', false, testo)) area.setRangeText(testo, area.selectionStart, area.selectionEnd, 'end');
}
chrome.runtime.onMessage.addListener((m, _mitt, rispondi) => {
  if (!m || m.a !== 'paginaDettatura') return;
  if (m.dett === 'avvia') {
    sessione = creaSessione({ sostituzioni: m.sostituzioni || [], automatica: m.automatica !== false });
    mostraProva({ fase: 'preparazione' });
  } else if (m.dett === 'stato') mostraProva(m.stato);
  else if (m.dett === 'testo' && sessione) {
    const prima = area.value.slice(0, area.selectionStart);
    const r = sessione.segmento(m.testo, { prima, pausa: m.pausa, probSilenzio: m.probSilenzio, logprob: m.logprob });
    if (r.testo) inserisci(r.testo);
    else if (r.comando === 'cancellaFrase' || r.comando === 'cancellaParola' || r.comando === 'annulla') {
      // nella prova: via l'ultima frase
      const v = area.value.replace(/\s+$/, '');
      const i = Math.max(v.lastIndexOf('. ', v.length - 2), v.lastIndexOf('\n'));
      area.value = i < 0 ? '' : v.slice(0, i + 1);
    }
    rispondi({ ok: true, stop: r.comando === 'stop' });
    return;
  } else if (m.dett === 'fine') {
    if (sessione) {
      const coda = sessione.chiudi();
      if (coda && !/[.!?]\s*$/.test(area.value)) inserisci(coda);
    }
    sessione = null;
    $('#provaStato').textContent = '';
    $('#dettaQui').textContent = 'Detta qui';
  }
  rispondi({ ok: true });
});

// scorciatoia
async function scorciatoia() {
  const c = (await chrome.commands.getAll()).find((x) => x.name === 'dettatura');
  const tasto = c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc') : '';
  for (const k of document.querySelectorAll('.tastoDetta')) k.textContent = tasto || 'Alt+S';
  $('#tastoAvviso').hidden = !!tasto;
}
for (const a of document.querySelectorAll('.apriTasti')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// ---------- dizionario ----------
const MAX_SOST = 200;
let diz = { sostituzioni: [], termini: [] };
async function leggiDiz() {
  const { dettDizionario: d } = await chrome.storage.sync.get('dettDizionario');
  diz = { sostituzioni: (d && d.sostituzioni) || [], termini: (d && d.termini) || [] };
  mostraDiz();
}
async function salvaDiz() {
  try {
    await chrome.storage.sync.set({ dettDizionario: diz });
    $('#dizStato').textContent = 'Salvato.';
  } catch (e) {
    $('#dizStato').textContent = `Non salvato: ${e.message || e}. Il dizionario sincronizzato ha un limite di circa 8 KB.`;
  }
}
function mostraDiz() {
  const tb = $('#sostRighe');
  tb.textContent = '';
  diz.sostituzioni.forEach(([a, b], i) => {
    const tr = document.createElement('tr');
    for (const v of [a, b]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    const td = document.createElement('td');
    td.className = 'az';
    const x = document.createElement('button');
    x.textContent = 'Togli';
    x.addEventListener('click', async () => {
      diz.sostituzioni.splice(i, 1);
      await salvaDiz();
      mostraDiz();
    });
    td.append(x);
    tr.append(td);
    tb.append(tr);
  });
  $('#termini').value = diz.termini.join(', ');
}
$('#sostAggiungi').addEventListener('click', async () => {
  const a = $('#sostDetto').value.trim();
  const b = $('#sostScritto').value.trim();
  if (!a || !b) return;
  if (diz.sostituzioni.length >= MAX_SOST) {
    $('#dizStato').textContent = `Al massimo ${MAX_SOST} sostituzioni.`;
    return;
  }
  diz.sostituzioni = diz.sostituzioni.filter((v) => v[0].toLowerCase() !== a.toLowerCase());
  diz.sostituzioni.push([a.slice(0, 100), b.slice(0, 100)]);
  $('#sostDetto').value = $('#sostScritto').value = '';
  await salvaDiz();
  mostraDiz();
});
$('#salvaTermini').addEventListener('click', async () => {
  diz.termini = [...new Set($('#termini').value.split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 60);
  await salvaDiz();
  mostraDiz();
});

// ---------- opzioni ----------
async function leggiOpzioni() {
  const o = await chrome.storage.local.get(['dettPunteggiatura', 'dettMotore', 'dettRiserva']);
  $('#punteggiatura').checked = o.dettPunteggiatura !== false;
  const v = o.dettMotore === 'webspeech' ? (o.dettRiserva === 'google' ? 'google' : 'locale') : 'whisper';
  for (const r of document.querySelectorAll('input[name="motore"]')) r.checked = r.value === v;
  // Chrome ha l'italiano sul dispositivo?
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let t = 'Questo Chrome non ha il riconoscimento vocale.';
  if (SR && typeof SR.available === 'function') {
    try {
      const a = await SR.available({ langs: ['it-IT'], processLocally: true });
      t = {
        available: 'Chrome ha l\'italiano sul dispositivo: con la seconda scelta l\'audio resta sul computer.',
        downloadable: 'Chrome può scaricare l\'italiano sul dispositivo: con la seconda scelta lo scarica la prima volta.',
        downloading: 'Chrome sta scaricando l\'italiano sul dispositivo.',
        unavailable: 'Chrome non ha l\'italiano sul dispositivo: la seconda scelta non funziona qui.',
      }[a] || `Stato del riconoscimento sul dispositivo: ${a}.`;
    } catch {}
  } else if (SR) t = 'Questo Chrome non dice se ha l\'italiano sul dispositivo: la seconda scelta potrebbe non funzionare.';
  $('#webSpeechStato').textContent = t;
}
$('#punteggiatura').addEventListener('change', () => chrome.storage.local.set({ dettPunteggiatura: $('#punteggiatura').checked }));
for (const r of document.querySelectorAll('input[name="motore"]')) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    if (r.value === 'whisper') await chrome.storage.local.set({ dettMotore: 'whisper' });
    else {
      if (r.value === 'locale' && typeof SpeechRecognition !== 'undefined' && typeof SpeechRecognition.install === 'function') {
        // chiede a Chrome di scaricare l'italiano sul dispositivo (serve il clic)
        try {
          await SpeechRecognition.install({ langs: ['it-IT'], processLocally: true });
        } catch {}
      }
      await chrome.storage.local.set({ dettMotore: 'webspeech', dettRiserva: r.value });
    }
    leggiOpzioni();
  });
}

// ---------- avvio ----------
(async () => {
  const { dettModello } = await chrome.storage.local.get('dettModello');
  scelto = modelloDettaturaValido(dettModello);
  await controllaMicrofono();
  scorciatoia();
  leggiDiz();
  leggiOpzioni();
  await aggiornaPronti();
  misuraComputer();
  const s = await manda('dettaturaStato').catch(() => null);
  if (s && s.stato && s.stato.download && s.stato.download.totale) $('#barra').hidden = false;
  if (location.hash === '#modello') $('#modello').scrollIntoView();
})();
