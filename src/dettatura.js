// Pagina della dettatura: primo uso (microfono, misura del computer, scelta e download del
// modello), prova, dizionario e opzioni. Si apre da sola alla prima Ctrl+Spazio.

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
      scaricaDaSolo();
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
      ? "Consentito. Il microfono si accende solo mentre detti (lo vedi dall'indicatore rosso in alto nella pagina) e si spegne quando finisci."
      : permesso === 'denied'
        ? 'Bloccato.'
        : 'Serve il permesso di usare il microfono: Chrome lo chiede una volta sola.';
}
$('#micConsenti').addEventListener('click', async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of s.getTracks()) t.stop();
    permesso = 'granted';
    scaricaDaSolo();
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
  $('#cancella').hidden = !pronti[scelto] || scaricando;
}

for (const r of radio()) {
  r.addEventListener('change', async () => {
    scelto = r.value;
    // scelta a mano: resta anche se il modello non e' ancora scaricato, e si scarica da solo
    await chrome.storage.local.set({ dettModello: scelto, dettModelloUtente: true });
    mostraModello();
    scaricaDaSolo();
  });
}

/**
 * Proposta del modello: Normale salvo computer davvero lenti. La misura (una moltiplicazione di
 * matrici come quelle del modello, ripetuta, si tiene il valore migliore: un momento di carico del
 * computer non deve far proporre un modello peggiore) si fa una volta e si riusa.
 */
async function misuraComputer() {
  const { dettMisuraPC2: salvata } = await chrome.storage.local.get('dettMisuraPC2');
  let cpu;
  let gpu;
  if (salvata && salvata.cpu && Date.now() - salvata.quando < 30 * 86400000) ({ cpu, gpu } = salvata);
  else {
    try {
      const m = await conTempo(manda('dettaturaMisuraPC'), 25000, 'misura del computer');
      cpu = m && m.wasm && m.wasm.gflops;
      gpu = m && m.webgpu && m.webgpu.disponibile && m.webgpu.f16 ? 1 : null;
      if (cpu) await chrome.storage.local.set({ dettMisuraPC2: { cpu, gpu, quando: Date.now() } });
    } catch {}
  }
  const qRadio = radio().find((r) => r.value === 'qualita');
  qRadio.disabled = !gpu;
  if (!gpu) qRadio.closest('label').title = 'Questo computer non ha la scheda video adatta per Qualità';
  // Normale salvo processori davvero lenti (il Corridoio misura circa 70 a riposo e 30 sotto carico,
  // e con Normale trascrive una frase in circa un secondo)
  const proposta = cpu && cpu < SOGLIA_CPU ? 'leggero' : 'normale';
  const { dettModello } = await chrome.storage.local.get('dettModello');
  scelto = dettModello ? modelloDettaturaValido(dettModello) : proposta;
  // la proposta si salva (serve anche alla scorciatoia), ma non come scelta dell'utente
  if (!dettModello) await chrome.storage.local.set({ dettModello: scelto });
  for (const r of radio()) {
    const b = r.closest('label').querySelector('.consigliato');
    if (b) b.remove();
    if (r.value === proposta) {
      const s = document.createElement('span');
      s.className = 'consigliato';
      s.textContent = 'Consigliato per questo computer';
      r.closest('label').querySelector('strong').after(s);
    }
  }
  mostraModello();
}
// sotto questa misura il modello Normale supera i 3 secondi per frase
const SOGLIA_CPU = 15;

// Il modello si scarica da solo: appena c'e' il permesso del microfono, o quando si cambia modello.
// Il pulsante compare solo se il download non riesce ("Riprova").
let scaricando = false;
function scaricaDaSolo() {
  if (permesso === 'granted' && !pronti[scelto] && !scaricando) avviaDownload();
}
$('#scarica').addEventListener('click', () => avviaDownload());
async function avviaDownload() {
  if (scaricando) return;
  $('#scarica').hidden = true;
  scaricando = true;
  $('#scarica').disabled = true;
  $('#barra').hidden = false;
  $('#modelloStato').textContent = pronti[scelto] ? 'Carico il modello…' : 'Scarico il modello…';
  await chrome.storage.local.set({ dettModello: scelto });
  const r = await manda('dettaturaScarica', { modello: scelto }).catch((e) => ({ ok: false, errore: String((e && e.message) || e) }));
  scaricando = false;
  $('#scarica').disabled = false;
  $('#barra').hidden = true;
  if (!r || !r.ok) {
    $('#modelloStato').textContent = `Download non riuscito: ${(r && r.errore) || 'errore sconosciuto'}. Riprova: riparte da dove si era fermato.`;
    $('#scarica').textContent = 'Riprova';
    $('#scarica').hidden = false;
    return;
  }
  pronti[scelto] = true;
  mostraModello();
  // dalla fine del parlato al testo: 360 ms di attesa della pausa, poi la trascrizione
  const stima = 360 + r.misura.ms;
  await chrome.storage.local.set({ dettMisura: { modello: scelto, ms: r.misura.ms, stima, quando: Date.now(), ep: r.misura.ep } });
  let testo = `Pronto. Una frase di 4 secondi diventa testo circa ${sec(stima)} dopo che hai smesso di parlare.`;
  if (r.info && r.info.finestraVariabile === false) testo += ' (La versione veloce del modello non è raggiungibile: uso quella completa, più lenta.)';
  if (stima > 2500 && scelto !== 'leggero') testo += ' È lento su questo computer: prova il modello Leggero.';
  $('#modelloStato').textContent = testo;
}

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
    rilascioMandato = false;
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

// premi per parlare anche qui: il rilascio di Ctrl o Spazio va al service worker
let rilascioMandato = true;
window.addEventListener(
  'keyup',
  (e) => {
    if (!sessione || rilascioMandato || !(e.key === 'Control' || e.code === 'Space' || e.key === ' ')) return;
    rilascioMandato = true;
    manda('dettaturaRilascio').catch(() => {});
  },
  true
);

// scorciatoia
async function scorciatoia() {
  const c = (await chrome.commands.getAll()).find((x) => x.name === 'dettatura');
  const tasto = c && c.shortcut ? c.shortcut.replace(/Shift/g, 'Maiusc').replace(/BARRA SPAZIATRICE|Space/gi, 'Spazio') : '';
  for (const k of document.querySelectorAll('.tastoDetta')) k.textContent = tasto || 'Ctrl+Spazio';
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
// Ogni passo ha un tempo massimo: se qualcosa non risponde la pagina lo dice e va avanti,
// invece di restare ferma su "Controllo il permesso…".
function conTempo(promessa, ms, nome) {
  return Promise.race([
    Promise.resolve(promessa),
    new Promise((_, ko) => setTimeout(() => ko(new Error(`${nome}: nessuna risposta in ${ms / 1000} s`)), ms)),
  ]);
}
function avvisoAvvio(e) {
  console.error(e);
  const p = $('#modelloStato');
  p.textContent = `Qualcosa non è partito (${e.message || e}). Ricarica la pagina; se resta così, disattiva e riattiva WebG Voice in chrome://extensions.`;
}
/** Stato salvato dalle versioni precedenti: si tiene solo quello coerente. */
async function sistemaStatoSalvato() {
  const o = await chrome.storage.local.get(['dettModello', 'dettModelloUtente', 'dettMisuraPC']);
  // la misura della 1.3.0-1.3.3 (una sola serie, falsata dal carico) proponeva Leggero a torto
  if (o.dettMisuraPC) await chrome.storage.local.remove('dettMisuraPC');
  // un modello salvato ma mai scaricato ne' scelto a mano era solo una proposta: si ricalcola
  if (o.dettModello && !o.dettModelloUtente && !pronti[modelloDettaturaValido(o.dettModello)]) await chrome.storage.local.remove('dettModello');
  if (o.dettModello && !Object.hasOwn(MODELLI_DETTATURA, o.dettModello)) await chrome.storage.local.remove('dettModello');
}
(async () => {
  globalThis.dettaturaPaginaPronta = true; // lo script e' partito: la guardia non serve
  // subito una scelta visibile: il consigliato di base finche' la misura non dice altro
  scelto = 'normale';
  mostraModello();
  for (const [passo, ms] of [
    [controllaMicrofono, 5000],
    [scorciatoia, 5000],
    [leggiDiz, 5000],
    [leggiOpzioni, 8000],
  ]) {
    conTempo(passo(), ms, passo.name).catch(avvisoAvvio);
  }
  try {
    await conTempo(aggiornaPronti(), 20000, 'stato dei modelli');
  } catch (e) {
    avvisoAvvio(e);
  }
  try {
    await conTempo(sistemaStatoSalvato(), 5000, 'stato salvato');
    const { dettModello } = await chrome.storage.local.get('dettModello');
    if (dettModello) scelto = modelloDettaturaValido(dettModello);
    mostraModello();
    await conTempo(misuraComputer(), 30000, 'misura del computer');
    scaricaDaSolo();
  } catch (e) {
    avvisoAvvio(e);
    mostraModello();
  }
  const s = await conTempo(manda('dettaturaStato'), 5000, 'stato').catch(() => null);
  if (s && s.stato && s.stato.download && s.stato.download.totale) $('#barra').hidden = false;
  if (location.hash === '#modello') $('#modello').scrollIntoView();

})();
