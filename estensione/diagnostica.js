// Pagina di diagnostica: misura la sintesi su questo PC con lo stesso motore
// della lettura, e salva la stima, cosi' la lettura si adatta da subito.
import { modelliInCache, BYTE_TOTALI, VOCI, voceValida } from './lib/modelli.js';
import { wav, FREQUENZA } from './lib/audio.js';
import { leggiDizionario, salvaDizionario as salvaInSync } from './lib/dizionario.js';

const $ = (id) => document.getElementById(id);
const manifest = chrome.runtime.getManifest();
const nome = chrome.i18n.getMessage('nomeEstensione');
$('titolo').textContent = nome;
document.title = nome;
$('versioneTesta').textContent = `Versione ${manifest.version}.`;
chrome.commands.getAll().then((c) => {
  const tasto = (nome) => {
    const x = c.find((k) => k.name === nome);
    return x && x.shortcut ? x.shortcut.replace(/Shift/g, 'Maiusc') : 'non assegnata';
  };
  $('tasto').textContent = tasto('leggi-selezione');
  $('tastoStop').textContent = tasto('ferma-lettura');
});
$('tasti').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

const FRASI = [
  ['breve', 'Buongiorno a tutti.'],
  ['primo blocco', 'Questa è una prova di lettura: la voce legge una frase di media lunghezza, come la prima parte di un testo.'],
  [
    'blocco lungo',
    'Quando il testo è lungo, la lettura procede a blocchi: mentre uno suona, il successivo si prepara in anticipo, ' +
      'così non ci sono pause. Se il computer è lento, i blocchi diventano più corti e il lettore ne tiene pronti di più, ' +
      'per evitare interruzioni fra una frase e l\'altra.',
  ],
];

const info = {
  versione: manifest.version,
  browser: (navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0].replace('/', ' '),
  sistema: navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform,
  'processori logici': navigator.hardwareConcurrency || '?',
  memoria: navigator.deviceMemory ? `almeno ${navigator.deviceMemory} GB` : 'non nota',
  'isolamento (thread)': crossOriginIsolated ? 'sì' : 'no',
  voce: 'non ancora verificata',
};
const risultati = {};

function scrivi(dl, oggetto) {
  dl.innerHTML = '';
  for (const [k, v] of Object.entries(oggetto)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
}

let worker = null;
let idSeq = 0;
const attese = new Map();
function chiedi(msg) {
  const id = ++idSeq;
  return new Promise((risolvi, rifiuta) => {
    attese.set(id, { risolvi, rifiuta });
    worker.postMessage({ ...msg, id });
  });
}
function avviaWorker() {
  worker = new Worker(new URL('./motore-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === 'progresso') {
      if (m.voce && m.file && m.file !== 'voce' && m.file !== 'modello') {
        $('voceStato').textContent = `Scarico la voce ${VOCI[voceValida(m.voce)].nome}: ${Math.floor((100 * m.scaricati) / m.totale)}%`;
        return;
      }
      if (m.fase === 'download' && m.totale) {
        $('avanz').hidden = false;
        $('avanz').value = m.scaricati / m.totale;
        $('stato').textContent = `Scarico la voce: ${Math.round(m.scaricati / 1e6)} di ${Math.round(m.totale / 1e6)} MB`;
      } else $('stato').textContent = 'Avvio il motore…';
      return;
    }
    const a = attese.get(m.id);
    if (!a) return;
    attese.delete(m.id);
    if (m.tipo === 'errore') a.rifiuta(new Error(m.messaggio));
    else a.risolvi(m);
  };
}

let audioProva = null;

function verdetto(rtf) {
  if (rtf < 0.7) return ['ok', 'Nessun rischio di pause: la sintesi è ben più veloce della lettura.'];
  if (rtf < 0.9) return ['ok', 'Lettura continua; al massimo una breve pausa all\'avvio di testi lunghi.'];
  if (rtf < 1.1) return ['attenzione', 'La sintesi va quasi alla velocità della voce: possibili brevi pause, sempre a fine frase. L\'estensione misura il computer e decide da sola quanto testo preparare per volta.'];
  return ['male', 'Computer lento per una lettura continua: ci saranno pause fra i blocchi, anche con l\'adattamento automatico.'];
}

async function prova() {
  $('avvia').disabled = true;
  $('ascolta').disabled = $('copia').disabled = true;
  $('verdetto').hidden = true;
  scrivi($('risultati'), {});
  try {
    if (!(await modelliInCache())) {
      const ok = confirm(`La voce non è ancora sul computer. Serve scaricare circa ${Math.round(BYTE_TOTALI / 1e6)} MB, una volta sola. Procedo?`);
      if (!ok) {
        $('stato').textContent = 'Prova annullata: la voce non è stata scaricata.';
        return;
      }
    }
    if (!worker) avviaWorker();
    $('stato').textContent = 'Avvio il motore…';
    const t0 = performance.now();
    const r = await chiedi({ tipo: 'avvia' });
    const caricamento = performance.now() - t0;
    $('avanz').hidden = true;
    info.voce = 'presente, funziona offline';
    info['thread di calcolo'] = r.info.fili;
    scrivi($('info'), info);
    risultati['avvio del motore'] = `${(caricamento / 1000).toFixed(1)} s`;

    const parti = [];
    let rtfLungo = 0;
    let rtfPrimo = 0;
    for (const [etichetta, frase] of FRASI) {
      $('stato').textContent = `Sintetizzo: ${etichetta}…`;
      const f = (await chiedi({ tipo: 'fonemi', testo: frase, normalizza: true })).fonemi;
      const s = await chiedi({ tipo: 'sintetizza', fonemi: f, velocita: 1, pausa: 0.3 });
      const sec = s.audio.length / FREQUENZA - 0.3;
      risultati[`${etichetta} (${[...f].length} fonemi)`] = `${(s.ms / 1000).toFixed(2)} s per ${sec.toFixed(1)} s di audio, rapporto ${s.rtf.toFixed(2)}`;
      if (etichetta === 'primo blocco') risultati['primo suono stimato'] = `${(s.ms / 1000).toFixed(1)} s col motore già avviato, ${((s.ms + caricamento) / 1000).toFixed(1)} s alla prima lettura`;
      if (etichetta === 'blocco lungo') rtfLungo = s.rtf;
      if (etichetta === 'primo blocco') rtfPrimo = s.rtf;
      parti.push(s.audio);
    }
    // conta il peggiore fra blocco medio e lungo: sono quelli di una lettura vera
    const rtf = Math.max(rtfPrimo, rtfLungo);
    risultati['rapporto col tempo reale'] = `${rtf.toFixed(2)} (sotto 1 la sintesi è più veloce della lettura)`;
    const [classe, testo] = verdetto(rtf);
    $('verdetto').className = `verdetto ${classe}`;
    $('verdetto').textContent = testo;
    $('verdetto').hidden = false;
    risultati.esito = testo;
    scrivi($('risultati'), risultati);
    $('stato').textContent = 'Prova finita.';
    const tot = parti.reduce((s, p) => s + p.length, 0);
    audioProva = new Float32Array(tot);
    let o = 0;
    for (const p of parti) {
      audioProva.set(p, o);
      o += p.length;
    }
    $('ascolta').disabled = $('copia').disabled = false;
  } catch (e) {
    $('stato').textContent = `Errore: ${e.message || e}`;
  } finally {
    $('avvia').disabled = false;
  }
}

function testoRisultato() {
  const righe = [`${nome} ${manifest.version}, prova del ${new Date().toLocaleString('it-IT')}`];
  for (const [k, v] of Object.entries(info)) righe.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(risultati)) righe.push(`${k}: ${v}`);
  return righe.join('\n');
}

$('avvia').addEventListener('click', prova);
$('copia').addEventListener('click', async () => {
  await navigator.clipboard.writeText(testoRisultato());
  $('stato').textContent = 'Risultato copiato negli appunti.';
});
$('ascolta').addEventListener('click', () => {
  if (!audioProva) return;
  const url = URL.createObjectURL(new Blob([wav(audioProva)], { type: 'audio/wav' }));
  new Audio(url).play();
});

chrome.storage.local.get('rtf').then(({ rtf }) => {
  info['adattamento automatico'] = typeof rtf === 'number' ? `rapporto misurato nelle letture: ${rtf.toFixed(2)}` : 'nessuna lettura ancora misurata';
  scrivi($('info'), info);
});
scrivi($('info'), info);
modelliInCache().then((c) => {
  info.voce = c ? 'presente, funziona offline' : `da scaricare (circa ${Math.round(BYTE_TOTALI / 1e6)} MB)`;
  scrivi($('info'), info);
});

// ---- Dizionario di pronuncia (chrome.storage.sync, spezzato in piu' chiavi: lib/dizionario.js) ----
let voci = [];

async function caricaDizionario() {
  try {
    voci = await leggiDizionario();
  } catch {
    voci = [];
  }
  disegnaDizionario();
}

/** Salva; se non ci sta torna alla versione salvata e lo dice. Restituisce true se salvato. */
async function salvaDizionario(msg) {
  let r;
  try {
    r = await salvaInSync(voci);
  } catch (e) {
    r = { errore: `Non salvato: ${e.message || e}` };
  }
  if (r.errore) {
    await caricaDizionario();

// ---- Voce (Sara o Nicola): la scelta vale per letture e MP3, il service worker la ricorda ----
let voceScelta = 'sara';
const radioVoce = [...document.querySelectorAll('input[name="voce"]')];
chrome.storage.local.get('voce').then(({ voce }) => {
  voceScelta = voceValida(voce);
  for (const r of radioVoce) r.checked = r.value === voceScelta;
});
for (const r of radioVoce) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    voceScelta = voceValida(r.value);
    $('voceStato').textContent = `Voce scelta: ${VOCI[voceScelta].nome}.`;
    try {
      await chrome.runtime.sendMessage({ a: 'background', tipo: 'voce', valore: voceScelta });
    } catch {}
  });
}
const FRASE_PROVA = (nome) => `Ciao, sono ${nome}. Posso leggerti un articolo intero, o salvarlo in un file MP3 da ascoltare quando vuoi.`;
let audioVoce = null;
for (const b of document.querySelectorAll('[data-ascolta]')) {
  b.addEventListener('click', async () => {
    const v = voceValida(b.dataset.ascolta);
    try {
      if (!(await modelliInCache())) {
        $('voceStato').textContent = 'La voce non è ancora scaricata: prova di nuovo fra poco.';
        return;
      }
      b.disabled = true;
      if (!worker) avviaWorker();
      $('voceStato').textContent = 'Preparo la voce…';
      await chiedi({ tipo: 'avvia' });
      const { fonemi } = await chiedi({ tipo: 'fonemi', testo: FRASE_PROVA(VOCI[v].nome), normalizza: true });
      const s = await chiedi({ tipo: 'sintetizza', fonemi, velocita: 1, pausa: 0, voce: v });
      if (audioVoce) audioVoce.pause();
      audioVoce = new Audio(URL.createObjectURL(new Blob([wav(s.audio)], { type: 'audio/wav' })));
      await audioVoce.play();
      $('voceStato').textContent = `Ascolti ${VOCI[v].nome}.`;
    } catch (e) {
      $('voceStato').textContent = `Errore: ${e.message || e}`;
    } finally {
      b.disabled = false;
    }
  });
}
    $('dizStato').textContent = r.errore;
    return false;
  }
  voci = await leggiDizionario();
  $('dizStato').textContent = `${msg || 'Salvato.'} Nel dizionario: ${voci.length} voci, ${r.kb} KB.`;
  disegnaDizionario();
  return true;
}

function disegnaDizionario() {
  const tb = $('dizRighe');
  tb.innerHTML = '';
  voci.forEach((v, i) => {
    const tr = document.createElement('tr');
    const cella = (indice) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.value = v[indice];
      inp.maxLength = 100;
      inp.setAttribute('aria-label', indice ? 'Si legge' : 'Scritto');
      inp.addEventListener('change', () => {
        voci[i][indice] = inp.value;
        salvaDizionario();
      });
      td.append(inp);
      return td;
    };
    const az = document.createElement('td');
    az.className = 'az';
    const asc = document.createElement('button');
    asc.textContent = 'Ascolta';
    asc.addEventListener('click', () => ascolta(voci[i][0]));
    const del = document.createElement('button');
    del.textContent = 'Elimina';
    del.addEventListener('click', () => {
      voci.splice(i, 1);
      salvaDizionario('Eliminato.');
    });
    az.append(asc, ' ', del);
    tr.append(cella(0), cella(1), az);
    tb.append(tr);
  });
}

let audioDiz = null;
async function ascolta(scritto, extra) {
  if (!scritto || !scritto.trim()) return;
  try {
    if (!(await modelliInCache())) {
      $('dizStato').textContent = 'La voce non è ancora scaricata: prova di nuovo fra poco.';
      return;
    }
    if (!worker) avviaWorker();
    $('dizStato').textContent = 'Preparo la voce…';
    await chiedi({ tipo: 'avvia' });
    const diz = extra ? [...voci, extra] : voci;
    const { fonemi } = await chiedi({ tipo: 'fonemi', testo: scritto, normalizza: true, dizionario: diz });
    const s = await chiedi({ tipo: 'sintetizza', fonemi, velocita: 1, pausa: 0, voce: voceScelta });
    if (audioDiz) audioDiz.pause();
    audioDiz = new Audio(URL.createObjectURL(new Blob([wav(s.audio)], { type: 'audio/wav' })));
    await audioDiz.play();
    $('dizStato').textContent = `Fonemi: ${fonemi}`;
  } catch (e) {
    $('dizStato').textContent = `Errore: ${e.message || e}`;
  }
}

$('dizAggiungi').addEventListener('click', () => {
  const a = $('dizScritto').value.trim();
  const b = $('dizLettura').value.trim();
  if (!a || !b) {
    $('dizStato').textContent = 'Scrivi la parola e come si legge.';
    return;
  }
  const esistente = voci.findIndex((v) => v[0].toLowerCase() === a.toLowerCase());
  if (esistente >= 0) voci[esistente] = [a, b];
  else voci.push([a, b]);
  $('dizScritto').value = $('dizLettura').value = '';
  salvaDizionario('Aggiunto.');
});
$('dizAscoltaNuova').addEventListener('click', () => {
  const a = $('dizScritto').value.trim();
  const b = $('dizLettura').value.trim();
  ascolta(a, a && b ? [a, b] : null);
});
$('dizEsporta').addEventListener('click', () => {
  $('dizTesto').value = voci.map((v) => `${v[0]} = ${v[1]}`).join('\n');
  $('dizStato').textContent = `${voci.length} voci esportate qui sopra: copiale dove vuoi.`;
});
$('dizImporta').addEventListener('click', async () => {
  const righe = $('dizTesto').value.split('\n').filter((r) => r.trim());
  const nuove = [];
  let scartate = 0;
  for (const r of righe) {
    const i = r.indexOf('='); // si divide sul primo "=": la lettura puo' contenerne altri
    const a = i > 0 ? r.slice(0, i).trim() : '';
    const b = i > 0 ? r.slice(i + 1).trim() : '';
    if (a && b) nuove.push([a.slice(0, 100), b.slice(0, 100)]);
    else scartate++;
  }
  for (const n of nuove) {
    const i = voci.findIndex((v) => v[0].toLowerCase() === n[0].toLowerCase());
    if (i >= 0) voci[i] = n;
    else voci.push(n);
  }
  const ok = await salvaDizionario(`${nuove.length} voci importate, ${scartate} righe scartate.`);
  if (!ok) $('dizStato').textContent += ` Nessuna voce importata (${scartate} righe scartate).`;
});
caricaDizionario();

// ---- Voce (Sara o Nicola): la scelta vale per letture e MP3, il service worker la ricorda ----
let voceScelta = 'sara';
const radioVoce = [...document.querySelectorAll('input[name="voce"]')];
chrome.storage.local.get('voce').then(({ voce }) => {
  voceScelta = voceValida(voce);
  for (const r of radioVoce) r.checked = r.value === voceScelta;
});
for (const r of radioVoce) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    voceScelta = voceValida(r.value);
    $('voceStato').textContent = `Voce scelta: ${VOCI[voceScelta].nome}.`;
    try {
      await chrome.runtime.sendMessage({ a: 'background', tipo: 'voce', valore: voceScelta });
    } catch {}
  });
}
const FRASE_PROVA = (nome) => `Ciao, sono ${nome}. Posso leggerti un articolo intero, o salvarlo in un file MP3 da ascoltare quando vuoi.`;
let audioVoce = null;
for (const b of document.querySelectorAll('[data-ascolta]')) {
  b.addEventListener('click', async () => {
    const v = voceValida(b.dataset.ascolta);
    try {
      if (!(await modelliInCache())) {
        $('voceStato').textContent = 'La voce non è ancora scaricata: prova di nuovo fra poco.';
        return;
      }
      b.disabled = true;
      if (!worker) avviaWorker();
      $('voceStato').textContent = 'Preparo la voce…';
      await chiedi({ tipo: 'avvia' });
      const { fonemi } = await chiedi({ tipo: 'fonemi', testo: FRASE_PROVA(VOCI[v].nome), normalizza: true });
      const s = await chiedi({ tipo: 'sintetizza', fonemi, velocita: 1, pausa: 0, voce: v });
      if (audioVoce) audioVoce.pause();
      audioVoce = new Audio(URL.createObjectURL(new Blob([wav(s.audio)], { type: 'audio/wav' })));
      await audioVoce.play();
      $('voceStato').textContent = `Ascolti ${VOCI[v].nome}.`;
    } catch (e) {
      $('voceStato').textContent = `Errore: ${e.message || e}`;
    } finally {
      b.disabled = false;
    }
  });
}
