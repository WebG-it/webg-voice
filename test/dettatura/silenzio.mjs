// Niente testo inventato: silenzio, ventola e tastiera (30 s) non devono scrivere niente; una frase
// seguita da 25 s di silenzio deve scrivere solo la frase, e la dettatura si deve fermare da sola.
// SOLO Chrome for Testing headless, profilo temporaneo, microfono finto di Chrome.
//   npm run build:test
//   CHROME=<chrome> MODELLI=<cartella modelli> AUDIO=<cartella wav> node test/dettatura/silenzio.mjs
// Wav attesi in AUDIO: silenzio30.wav, ventola30.wav, tastiera30.wav, frase_silenzio.wav (vedi test/README.md)
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PAGINE } from './pagine.mjs';
import { FILE_DETTATURA } from '../../src/lib/modelli-dettatura.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const { MODELLI, AUDIO, CHROME } = process.env;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const LOCALI = {
  dettTok: 'small/tokenizer.json',
  dettSmallEnc: 'small/onnx/encoder_model_int8_corto.onnx',
  dettSmallEncIntero: 'small/onnx/encoder_model_int8.onnx',
  dettSmallDec: 'small/onnx/decoder_model_merged_int8.onnx',
};

const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (u.startsWith('/modelli/')) {
    const f = join(MODELLI, u.slice(9));
    if (!existsSync(f)) return r.writeHead(404).end();
    const n = statSync(f).size;
    const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'cross-origin-resource-policy': 'cross-origin', 'accept-ranges': 'bytes' };
    if (q.method === 'OPTIONS') return r.writeHead(204, h).end();
    const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (!m) return (r.writeHead(200, { ...h, 'content-length': n }), createReadStream(f).pipe(r));
    const a = +m[1];
    const b = m[2] ? Math.min(+m[2], n - 1) : n - 1;
    r.writeHead(206, { ...h, 'content-range': `bytes ${a}-${b}/${n}`, 'content-length': b - a + 1 });
    return createReadStream(f, { start: a, end: b }).pipe(r);
  }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGINE.react);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

async function prova(file, secondi) {
  const profilo = mkdtempSync(join(tmpdir(), 'silenzio-'));
  const b = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [EXT],
    executablePath: CHROME,
    userDataDir: profilo,
    args: ['--no-first-run', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${join(AUDIO, file)}`],
  });
  if (!/--headless/.test(b.process().spawnargs.join(' '))) {
    b.process().kill();
    throw new Error('non headless');
  }
  try {
    const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
    const extId = new URL(swT.url()).host;
    const sw = await swT.worker();
    const ext = (await b.extensions()).get(extId);
    const mappa = {};
    for (const [k, f] of Object.entries(FILE_DETTATURA)) if (LOCALI[k]) for (const u of f.fonti) mappa[u] = `${BASE}/modelli/${LOCALI[k]}`;
    await sw.evaluate((m) => globalThis.__testFontiDettatura(m), mappa);
    const cdp = await b.target().createCDPSession();
    await cdp.send('Browser.setPermission', { origin: `chrome-extension://${extId}`, permission: { name: 'microphone' }, setting: 'granted' });
    // modello gia' pronto prima di ascoltare: la prova riguarda l'ascolto, non il download
    const pd = await b.newPage();
    await pd.goto(`chrome-extension://${extId}/dettatura.html`);
    await pd.evaluate(() => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaScarica', modello: 'normale' }));
    await pd.close();
    const page = await b.newPage();
    await page.goto(`${BASE}/react`);
    await page.click('#campo');
    await page.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await dorme(300);
    await (await pt.asPage()).close();
    await page.bringToFront();
    await page.focus('#campo');
    const av = await sw.evaluate(() => globalThis.__testComando());
    const t0 = Date.now();
    let fermata = null;
    while (Date.now() - t0 < secondi * 1000) {
      const s = await sw.evaluate(() => globalThis.__testStatoDettatura());
      if (s && !s.attiva && fermata === null) fermata = Date.now() - t0;
      await dorme(1000);
    }
    const s = await sw.evaluate(() => globalThis.__testStatoDettatura());
    const testo = await page.$eval('#campo', (e) => e.value);
    return { avviata: !!(av && av.avviata), testo, fermataDopoMs: fermata, scartati: (s && s.stato && s.stato.scartati) || [] };
  } finally {
    await b.close();
    try {
      rmSync(profilo, { recursive: true, force: true });
    } catch {}
  }
}

let ko = 0;
const FRASE = 'ho pubblicato una nuova recensione su recensioni di marco poi ho controllato che la pagina si vedesse bene anche dal telefono';
for (const [file, sec] of [
  ['silenzio30.wav', 30],
  ['ventola30.wav', 30],
  ['tastiera30.wav', 30],
  ['frase_silenzio.wav', 34],
]) {
  const r = await prova(file, sec);
  let ok;
  if (file === 'frase_silenzio.wav') {
    // solo le parole della frase, e fine da sola dopo 20 s di silenzio
    const parole = r.testo.toLowerCase().replace(/[^\p{L} ]+/gu, ' ').split(/\s+/).filter(Boolean);
    const estranee = parole.filter((p) => !FRASE.includes(p));
    ok = r.avviata && parole.length >= 8 && estranee.length <= 2 && r.fermataDopoMs !== null;
    log(ok ? 'OK ' : 'KO ', file, JSON.stringify({ testo: r.testo, estranee, fermataDopoMs: r.fermataDopoMs, scartati: r.scartati }));
  } else {
    ok = r.avviata && r.testo.trim() === '';
    log(ok ? 'OK ' : 'KO ', file, JSON.stringify({ testo: r.testo, fermataDopoMs: r.fermataDopoMs, scartati: r.scartati }));
  }
  if (!ok) ko++;
}
server.close();
console.log(`\n${4 - ko} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
