// Prova end-to-end della trascrizione di una call, SOLO Chrome for Testing, profilo temporaneo.
//   npm run build:test && npm i --no-save puppeteer
//   CHROME=<chrome for testing> MODELLI=<cartella con parakeet/> AUDIO=<cartella con call.wav, io.wav, turni.json>
//     [SCHEDA=prova|reale] [SENZA_TESTA=1] node test/call/e2e.mjs
// Il "microfono" e' io.wav (microfono finto di Chrome); l'audio della "scheda" e' call.wav, con
// SCHEDA=prova suonato dall'offscreen come flusso, con SCHEDA=reale da una pagina con <audio> catturata
// davvero con tabCapture (richiede una finestra: SENZA_TESTA=1, in un Chrome for Testing separato).
// Controlla: i testi, le due fonti distinte, gli orari, la memoria e che il file si possa salvare.
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILE_CHIAMATA } from '../../src/lib/modelli-chiamata.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const { MODELLI, AUDIO } = process.env;
const SCHEDA = process.env.SCHEDA || 'prova';
const SENZA_TESTA = !!process.env.SENZA_TESTA;
// FRASI: json con { id, parlato } delle frasi di prova (solo per la prova con turni.json)
const FRASI = process.env.FRASI;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const esiti = [];
const controlla = (nome, ok, dettaglio = '') => {
  esiti.push({ nome, ok });
  log(ok ? 'OK ' : 'KO ', nome, dettaglio ? `| ${dettaglio}` : '');
};

const LOCALI = { chiamEnc: 'parakeet/encoder-model.int8.onnx', chiamDec: 'parakeet/decoder_joint-model.int8.onnx', chiamSpettro: 'parakeet/nemo128.onnx', chiamVoc: 'parakeet/vocab.txt' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'cross-origin-resource-policy': 'cross-origin', 'accept-ranges': 'bytes' };
  if (u.startsWith('/modelli/') || u === '/call.wav') {
    const f = u === '/call.wav' ? join(AUDIO, 'call.wav') : join(MODELLI, u.slice(9));
    if (!existsSync(f)) return r.writeHead(404).end();
    const n = statSync(f).size;
    if (q.method === 'OPTIONS') return r.writeHead(204, CORS).end();
    const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    const tipo = u.endsWith('.wav') ? { 'content-type': 'audio/wav' } : {};
    if (!m) {
      r.writeHead(200, { ...CORS, ...tipo, 'content-length': n });
      return createReadStream(f).pipe(r);
    }
    const a = +m[1];
    const b = m[2] ? Math.min(+m[2], n - 1) : n - 1;
    r.writeHead(206, { ...CORS, ...tipo, 'content-range': `bytes ${a}-${b}/${n}`, 'content-length': b - a + 1 });
    return createReadStream(f, { start: a, end: b }).pipe(r);
  }
  if (u === '/riunione') {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return r.end('<!doctype html><title>Riunione di prova: cliente</title><body><h1>Call</h1><audio id="a" src="/call.wav" controls></audio><script>window.suona=()=>document.getElementById("a").play()</script>');
  }
  r.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
// seconda origine, per provare la navigazione verso un altro sito durante la call
const altro = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><title>Altro sito</title><body>altro</body>');
});
await new Promise((r) => altro.listen(0, '127.0.0.1', r));
const ALTRO = `http://127.0.0.1:${altro.address().port}`;
// NAVIGA=stessa|cross: dopo 20 s la scheda si ricarica (stessa origine) o va a un altro sito, e si controlla la barretta
const NAVIGA = process.env.NAVIGA;

// senza turni.json (call vera) si controllano solo tenuta, memoria e coda; DURATA_S = secondi dell'audio
const turni = existsSync(join(AUDIO, 'turni.json')) ? JSON.parse(readFileSync(join(AUDIO, 'turni.json'), 'utf8')) : { durata: +process.env.DURATA_S, turni: [] };
const CALL_VERA = turni.turni.length === 0;
const frasi = FRASI ? Object.fromEntries(JSON.parse(readFileSync(FRASI, 'utf8')).map((f) => [f.id, f.parlato])) : {};
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
function wer(rif, ipo) {
  const r = norm(rif);
  const h = norm(ipo);
  let d = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const p = d;
    d = [i];
    for (let j = 1; j <= h.length; j++) d[j] = Math.min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (r[i - 1] !== h[j - 1] ? 1 : 0));
  }
  return { err: d[h.length], tot: r.length };
}

/** Elenco dei processi del Chrome lanciato da noi con memoria privata e tipo (per capire chi occupa cosa). */
function dettaglioMemoria(pid) {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$all=Get-CimInstance Win32_Process; $ids=@(${pid}); do{$n=$all|?{$ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId}|%{$_.ProcessId}; $ids+=$n}while($n); $all|?{$ids -contains $_.ProcessId}|%{ $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if($p){ $t=if($_.CommandLine -match '--type=([a-z-]+)'){$matches[1]}else{'browser'}; $e=if($_.CommandLine -match '--utility-sub-type=([\w.]+)'){$matches[1]}else{''}; '{0} {1} {2} {3} MB' -f $_.ProcessId,$t,$e,[int]($p.PrivateMemorySize64/1MB) } }`,
      ],
      { encoding: 'utf8' }
    );
    return out.trim();
  } catch {
    return '';
  }
}

/** Memoria privata (MB) dei processi del Chrome lanciato da noi (radice e discendenti). */
function memoriaMB(pid) {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$all=Get-CimInstance Win32_Process; $ids=@(${pid}); do{$n=$all|?{$ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId}|%{$_.ProcessId}; $ids+=$n}while($n); ($all|?{$ids -contains $_.ProcessId}|%{(Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64}|Measure-Object -Sum).Sum/1MB`,
      ],
      { encoding: 'utf8' }
    );
    return Math.round(parseFloat(out.trim()));
  } catch {
    return null;
  }
}

// PROFILO=<cartella>: profilo che resta fra una prova e l'altra (il modello gia' scaricato non si riscarica)
const profilo = process.env.PROFILO || mkdtempSync(join(tmpdir(), 'call-e2e-'));
const args = ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--auto-accept-camera-and-microphone-capture', `--use-file-for-fake-audio-capture=${join(AUDIO, 'io.wav')}`];
// la cattura della scheda richiede un gesto vero sull'icona: nel test si abilita l'estensione di prova (id fisso dal percorso)
if (process.env.EXT_ID) args.push(`--allowlisted-extension-id=${process.env.EXT_ID}`);
const b = await puppeteer.launch({ headless: !SENZA_TESTA, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args });
if (!SENZA_TESTA && !/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
log('chrome PID', b.process().pid, SENZA_TESTA ? '(con finestra, Chrome for Testing temporaneo)' : '(headless)');
let massimoMB = 0;
let timerAggancio;
const campiona = setInterval(() => {
  const m = memoriaMB(b.process().pid);
  if (m) massimoMB = Math.max(massimoMB, m);
}, 5000);

try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(extId);
  // microfono gia' consentito all'estensione (nell'uso vero lo si concede una volta dalla pagina della dettatura)
  await (await b.target().createCDPSession()).send('Browser.grantPermissions', { origin: `chrome-extension://${extId}`, permissions: ['audioCapture'] });
  sw.on('console', (m) => log('[sw]', m.type(), m.text().slice(0, 400)));
  // l'offscreen document: console ed errori, agganciati appena il suo indirizzo e' noto
  const agganciati = new Set();
  const aggancia = async () => {
    for (const t of b.targets()) {
      if (agganciati.has(t) || !t.url().endsWith('/offscreen.html')) continue;
      agganciati.add(t);
      try {
        const cdp = await t.createCDPSession();
        await cdp.send('Runtime.enable');
        cdp.on('Runtime.consoleAPICalled', (e) => (process.env.DEBUG || ['warning', 'error'].includes(e.type)) && log('[offscreen]', e.type, e.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 400)));
        cdp.on('Runtime.exceptionThrown', (e) => log('[offscreen errore]', String((e.exceptionDetails.exception && e.exceptionDetails.exception.description) || e.exceptionDetails.text).slice(0, 800)));
        log('offscreen agganciato');
      } catch (e) {
        log('offscreen non agganciato', String(e).slice(0, 100));
      }
    }
  };
  timerAggancio = setInterval(aggancia, 500);
  b.on('targetcreated', async (t) => {
    if (t.type() !== 'worker' && t.type() !== 'other') return;
    try {
      const w = await t.worker();
      if (w) w.on('console', (m) => (process.env.DEBUG || ['warn', 'error'].includes(m.type())) && log('[worker]', m.text().slice(0, 300)));
    } catch {}
  });
  const page = await b.newPage();
  page.on('console', (m) => ['warn', 'error'].includes(m.type()) && log('[pagina]', m.text().slice(0, 200)));
  await page.goto(`${BASE}/riunione`);
  await page.bringToFront();
  // activeTab, come un clic sull'icona
  await page.triggerExtensionAction(ext);
  const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
  const popup = await pt.asPage();
  await dorme(400);
  if (SCHEDA === 'prova') {
    await popup.close();
    await page.bringToFront();
  }

  // il consenso a trascrivere (spunta una tantum del pannello) e' gia' dato
  await sw.evaluate(() => chrome.storage.local.set({ chiamataConsenso: true }));

  // fonti del modello: i file locali al posto di Hugging Face
  const mappa = {};
  for (const [k, loc] of Object.entries(LOCALI)) mappa[FILE_CHIAMATA[k].fonti[0]] = `${BASE}/modelli/${loc}`;
  await sw.evaluate((m) => globalThis.__testChiamataFonti(m), mappa);

  const t0 = Date.now();
  const tab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]);
  log('scheda:', tab.title);
  let av;
  if (SCHEDA === 'prova') av = await sw.evaluate((t, u) => globalThis.__testChiamataAvviaFile(t, u), tab, `${BASE}/call.wav`);
  else {
    // come l'utente: pannello, "Trascrivi la call", "Inizia a trascrivere questa scheda"
    popup.on('console', (m) => log('[popup]', m.text().slice(0, 300)));
    await popup.click('#chiamata');
    await popup.waitForFunction(() => [...document.querySelectorAll('#chiamataBox button')].some((x) => /Inizia a trascrivere/.test(x.textContent)), { timeout: 15000 });
    await popup.evaluate(() => [...document.querySelectorAll('#chiamataBox button')].find((x) => /Inizia a trascrivere/.test(x.textContent)).click());
    // il pannello si chiude da solo quando parte la cattura: l'avvio e' riuscito se la call risulta attiva
    av = { avviata: false, errore: 'non partita entro 60 s' };
    for (let k = 0; k < 120; k++) {
      await dorme(500);
      const st = await sw.evaluate(() => globalThis.__testChiamataStato()).catch(() => null);
      if (st && st.attiva && st.stato && st.stato.fase === 'attiva') {
        av = { avviata: true };
        break;
      }
      if (st && st.stato && st.stato.fase === 'errore') {
        av = { avviata: false, errore: st.stato.errore };
        break;
      }
    }
    if (!av.avviata) log('pannello:', await popup.evaluate(() => document.getElementById('chiamataBox').innerText).catch(() => '(chiuso)'));
    await popup.close().catch(() => {});
    await page.bringToFront();
  }
  log(`partita dopo ${((Date.now() - t0) / 1000).toFixed(1)} s (compreso il caricamento del modello)`, JSON.stringify(av));
  controlla('avvio', av && av.avviata === true, av && av.errore);
  if (SCHEDA === 'reale') await page.evaluate(() => window.suona());
  const iniziata = Date.now();

  if (NAVIGA) {
    await dorme(15000);
    await page.goto(NAVIGA === 'cross' ? `${ALTRO}/` : `${BASE}/riunione`);
    await dorme(6000);
    const barretta2 = await page.evaluate(() => !!document.querySelector('[data-webg-voice="chiamata"]'));
    const st2 = await sw.evaluate(() => globalThis.__testChiamataStato()).catch(() => ({}));
    if (NAVIGA === 'stessa') {
      controlla('stessa origine: barretta rimessa e call ancora attiva', barretta2 === true && st2.attiva === true, JSON.stringify({ barretta2, attiva: st2.attiva }));
    } else {
      controlla('altro sito: la trascrizione si ferma (la barretta non può restare)', st2.attiva === false, JSON.stringify({ barretta2, attiva: st2.attiva }));
      let u = null;
      for (let i = 0; i < 20 && !u; i++) {
        await dorme(500);
        u = await sw.evaluate(async () => (await chrome.storage.local.get('chiamataUltima')).chiamataUltima);
      }
      controlla('altro sito: il testo è stato salvato', !!(u && (u.salvata || u.inCorso)), JSON.stringify(u));
      if (u && u.downloadId !== undefined) {
        const d = await sw.evaluate(async (id) => (await chrome.downloads.search({ id }))[0], u.downloadId);
        const md = d && existsSync(d.filename) ? readFileSync(d.filename, 'utf8') : '';
        controlla('altro sito: il file dice perché è finita prima', /Fine anticipata: la barretta non poteva restare/.test(md), md.split(String.fromCharCode(10)).slice(2, 7).join(' | '));
        try {
          rmSync(d.filename);
        } catch {}
      }
      throw new Error('FINE_NAVIGAZIONE');
    }
  }
  // stato a meta' strada
  await dorme(Math.min(25000, turni.durata * 500));
  const s1 = await sw.evaluate(async () => (await chrome.storage.session.get('chiamata')).chiamata);
  controlla('stato in sessione', !!(s1 && s1.tabId === tab.id), JSON.stringify(s1));
  const barretta = await page.evaluate(() => !!document.querySelector('[data-webg-voice="chiamata"]'));
  controlla('barretta nella scheda', barretta === true);
  const badge = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tab.id);
  controlla('segno CALL sull\'icona', badge === 'CALL', badge);

  // si lascia finire l'audio (durata dei turni) piu' un margine per la coda
  const resto = turni.durata * 1000 + 6000 - (Date.now() - iniziata);
  for (let k = 0; k < Math.ceil(resto / 10000); k++) {
    await dorme(10000);
    const st = await sw.evaluate(() => globalThis.__testChiamataStato()).catch((e) => ({ errore: String(e) }));
    if (process.env.MEM_DETTAGLIO) log('processi:', dettaglioMemoria(b.process().pid));
    log('stato:', JSON.stringify(st.stato ? { fase: st.stato.fase, righe: st.stato.righe, inCoda: st.stato.inCoda, lacune: st.stato.lacune } : st));
  }
  const tStop = Date.now();
  await sw.evaluate(() => globalThis.__testChiamataFerma());
  // il file arriva dall'offscreen al service worker e va in storage (downloads non concesso nel test)
  let salvato = null;
  for (let i = 0; i < 120 && !salvato; i++) {
    await dorme(500);
    salvato = await sw.evaluate(async () => (await chrome.storage.local.get('chiamataDaSalvare')).chiamataDaSalvare);
    if (!salvato) {
      // salvato davvero nei download: si legge il file scritto da Chrome
      const u = await sw.evaluate(async () => (await chrome.storage.local.get('chiamataUltima')).chiamataUltima);
      if (u && u.salvata && u.downloadId !== undefined) {
        const d = await sw.evaluate(async (id) => (await chrome.downloads.search({ id }))[0], u.downloadId);
        if (d && d.state === 'complete' && existsSync(d.filename)) {
          controlla('file nella cartella WebG Voice dei download', d.filename.includes('WebG Voice'), d.filename.split('Users').pop());
          salvato = { testo: readFileSync(d.filename, 'utf8'), nomeFile: d.filename.replaceAll('\\', '/').split('/').pop() };
          try {
            rmSync(d.filename);
          } catch {}
        }
      }
    }
  }
  if (!salvato) log('stato offscreen:', JSON.stringify(await sw.evaluate(() => globalThis.__testChiamataStato()).catch((e) => String(e))));
  controlla('file prodotto', !!salvato, `${((Date.now() - tStop) / 1000).toFixed(1)} s dopo lo stop`);
  const ultima = await sw.evaluate(async () => (await chrome.storage.local.get('chiamataUltima')).chiamataUltima);
  log('ultima:', JSON.stringify(ultima));
  const barrettaDopo = await page.evaluate(() => !!document.querySelector('[data-webg-voice="chiamata"]'));
  controlla('barretta tolta alla fine', barrettaDopo === false);

  if (salvato && CALL_VERA) {
    writeFileSync(join(tmpdir(), 'call-e2e-ultimo.md'), salvato.testo);
    const righeVere = [...salvato.testo.matchAll(/^\*\*\[/gm)].length;
    controlla('call vera: righe prodotte', righeVere >= +(process.env.MIN_RIGHE || 20), `${righeVere} righe`);
    controlla('call vera: nessun tratto perso', !/Tratto non trascritto/.test(salvato.testo));
    console.log(salvato.testo.slice(0, 6000));
  } else if (salvato) {
    const md = salvato.testo;
    writeFileSync(join(tmpdir(), 'call-e2e-ultimo.md'), md);
    console.log('\n' + md + '\n');
    controlla('nome file con titolo e data', /^Riunione di prova cliente 20\d\d-\d\d-\d\d \d\d-\d\d\.md$/.test(salvato.nomeFile), salvato.nomeFile);
    controlla('host senza percorso', md.includes(`- Dove: 127.0.0.1:${server.address().port}`));
    const righe = [...md.matchAll(/^\*\*\[(\d+:\d+(?::\d+)?)\] (Call|Io):\*\* (.*)$/gm)].map((m) => ({ ora: m[1], fonte: m[2], testo: m[3] }));
    for (const fonte of ['Call', 'Io']) {
      const rif = turni.turni.filter((t) => t.fonte === fonte).map((t) => frasi[t.frase]).join(' ');
      const ipo = righe.filter((r) => r.fonte === fonte).map((r) => r.testo).join(' ');
      const w = wer(rif, ipo);
      controlla(`fonte ${fonte} distinta e riconosciuta (errori sulle parole)`, ipo.length > 0 && w.err / w.tot < 0.45, `${w.err} su ${w.tot} = ${((100 * w.err) / w.tot).toFixed(1)}%`);
    }
    // nessuna frase della Call finita in "Io" e viceversa: ogni riga e' vicina al turno giusto
    let fuori = 0;
    for (const r of righe) {
      const sec = r.ora.split(':').reduce((a, v) => a * 60 + +v, 0);
      const giusti = turni.turni.filter((t) => t.fonte === r.fonte);
      if (!giusti.some((t) => sec >= t.inizio - 4 && sec <= t.inizio + t.durata + 4)) fuori++;
    }
    controlla('orari coerenti con i turni (±4 s)', fuori === 0, `${fuori} righe fuori turno`);
  }
  controlla('memoria massima del browser', massimoMB > 0 && massimoMB < 4000, `${massimoMB} MB`);
} catch (e) {
  if (!String(e.message).includes('FINE_NAVIGAZIONE')) throw e;
} finally {
  clearInterval(campiona);
  clearInterval(timerAggancio);
  await b.close();
  server.close();
  altro.close();
  try {
    if (!process.env.PROFILO) rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
const ko = esiti.filter((e) => !e.ok).length;
console.log(`\n${esiti.length - ko} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
