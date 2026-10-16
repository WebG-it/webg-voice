// Passaggio dalla riserva all'encoder corto: chi ha scaricato il modello quando la release non
// rispondeva ha l'encoder originale (finestra intera, piu' lento). Alla volta dopo si usa quello e
// intanto si scarica l'encoder corto; dalla successiva si usa il corto e l'originale si cancella.
//   npm run build:test
//   CHROME=<chrome> MODELLI=<cartella modelli> node test/dettatura/riserva.mjs
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
const { MODELLI, CHROME } = process.env;
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

const profilo = mkdtempSync(join(tmpdir(), 'riserva-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: CHROME, userDataDir: profilo, args: ['--no-first-run'] });
let ko = 0;
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const mappa = (conCorto) => {
    const m = {};
    for (const [k, f] of Object.entries(FILE_DETTATURA)) {
      if (!LOCALI[k]) continue;
      for (const u of f.fonti) m[u] = k === 'dettSmallEnc' && !conCorto ? `${BASE}/modelli/non-c-e.onnx` : `${BASE}/modelli/${LOCALI[k]}`;
    }
    return m;
  };
  const pd = await b.newPage();
  await pd.goto(`chrome-extension://${extId}/dettatura.html`);
  const carica = () => pd.evaluate(() => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaScarica', modello: 'normale' }));
  const controlla = (nome, ok, d) => {
    if (!ok) ko++;
    log(ok ? 'OK ' : 'KO ', nome, d);
  };
  // 1) release irraggiungibile: riserva
  await sw.evaluate((m) => globalThis.__testFontiDettatura(m), mappa(false));
  const r1 = await carica();
  controlla('release irraggiungibile: si usa la riserva', r1.ok && r1.info.finestraVariabile === false, JSON.stringify(r1.info));
  // 2) release tornata: la dettatura riparte subito con la riserva e intanto scarica il corto
  await sw.evaluate((m) => globalThis.__testFontiDettatura(m), mappa(true));
  // il motore va ricreato (come dopo i 5 minuti di riposo): si chiude l'offscreen
  await sw.evaluate(() => chrome.offscreen.closeDocument());
  await dorme(500);
  await sw.evaluate((m) => globalThis.__testFontiDettatura(m), mappa(true));
  const r2 = await carica();
  controlla('alla volta dopo: riserva subito, corto in sottofondo', r2.ok && r2.info.finestraVariabile === false && r2.info.riserva === 'encoder corto in arrivo', JSON.stringify(r2.info));
  await dorme(15000);
  const r3 = await carica();
  controlla('dalla successiva: encoder corto', r3.ok && r3.info.finestraVariabile === true, JSON.stringify(r3.info));
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
console.log(ko ? `${ko} KO` : 'OK');
process.exit(ko ? 1 : 0);
