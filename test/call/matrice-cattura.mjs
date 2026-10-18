// Diagnosi: chi puo' chiedere l'identificativo della scheda (service worker o pannello) e chi puo'
// usarlo (offscreen document o pagina dell'estensione), con solo audio o con audio e video.
// Usa una mini estensione di prova (EXT), non quella di WebG Voice.
//   CHROME=... EXT=<cartella mini estensione> [ID_ALLOW=1] node test/call/matrice-cattura.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><title>Prova cattura</title><body>ciao</body>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profilo = mkdtempSync(join(tmpdir(), 'call-matrice-'));
const b = await puppeteer.launch({ headless: false, pipe: true, enableExtensions: [process.env.EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run', ...(process.env.FLAG ? process.env.FLAG.split(' ') : [])] });
console.log('chrome PID', b.process().pid);
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(new URL(swT.url()).host);
  const page = await b.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.bringToFront();
  await page.triggerExtensionAction(ext);
  const popup = await (await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 })).asPage();
  await dorme(500);
  const tabId = await popup.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  await sw.evaluate(() => globalThis.creaOff());
  await dorme(500);
  const idSw = () => sw.evaluate((t) => globalThis.idDaSw(t), tabId).catch((e) => `ERR ${e.message}`);
  const idPopup = () => popup.evaluate((t) => window.idDaPopup(t), tabId).catch((e) => `ERR ${e.message}`);
  const inOffscreen = (id, video) => popup.evaluate((id, video) => chrome.runtime.sendMessage({ t: 'consuma', id, video }), id, video);
  const inPopup = (id, video) => popup.evaluate((id, video) => window.consuma(id, video), id, video);
  for (const [rich, chiedi] of [['service worker', idSw], ['pannello', idPopup]]) {
    for (const [uso, consuma] of [['offscreen', inOffscreen], ['pagina dell\'estensione', inPopup]]) {
      for (const video of [false, true]) {
        const id = await chiedi();
        const esito = typeof id === 'string' && id.startsWith('ERR') ? id : await consuma(id, video);
        console.log(`id chiesto da ${rich.padEnd(15)} usato in ${uso.padEnd(24)} ${video ? 'audio+video' : 'solo audio  '} -> ${esito}`);
        await dorme(300);
      }
    }
  }
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
