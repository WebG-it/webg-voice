// Pagina di diagnostica: misura la sintesi su questo PC con lo stesso motore
// della lettura, e salva la stima, cosi' la lettura si adatta da subito.
import { modelliInCache, BYTE_TOTALI } from './lib/modelli.js';
import { wav, FREQUENZA } from './lib/audio.js';

const $ = (id) => document.getElementById(id);
const manifest = chrome.runtime.getManifest();
const nome = manifest.short_name || manifest.name;
$('titolo').textContent = `${nome}, diagnostica`;
document.title = `${nome}, diagnostica`;

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
  if (rtf < 1.1) return ['attenzione', 'Rischio di brevi pause fra un blocco e l\'altro. L\'estensione si adatta da sola: blocchi più corti e più anticipo.'];
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
    await chrome.storage.local.set({ rtf });
    const tot = parti.reduce((s, p) => s + p.length, 0);
    audioProva = new Float32Array(tot);
    let o = 0;
    for (const p of parti) {
      audioProva.set(p, o);
      o += p.length;
    }
    $('ascolta').disabled = $('copia').disabled = false;
    globalThis.__risultatoDiagnostica = { info: { ...info }, risultati: { ...risultati }, rtf };
  } catch (e) {
    $('stato').textContent = `Errore: ${e.message || e}`;
  } finally {
    $('avvia').disabled = false;
  }
}

function testoRisultato() {
  const righe = [`${manifest.name} ${manifest.version}, diagnostica del ${new Date().toLocaleString('it-IT')}`];
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
globalThis.__testoDiagnostica = testoRisultato;

scrivi($('info'), info);
modelliInCache().then((c) => {
  info.voce = c ? 'presente, funziona offline' : `da scaricare (circa ${Math.round(BYTE_TOTALI / 1e6)} MB)`;
  scrivi($('info'), info);
});
