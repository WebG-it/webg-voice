// Prova della sola cattura della scheda (tabCapture) in un Chrome for Testing con finestra, per capire
// cosa serve in automatico. Non fa parte della suite: serve a diagnosticare "Error starting tab capture".
//   CHROME=... EXT_ID=<id> node test/call/prova-cattura.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const SOLO_ID = !!process.env.SOLO_ID;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><title>Prova cattura</title><body>ciao</body>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profilo = mkdtempSync(join(tmpdir(), 'call-cattura-'));
const args = ['--no-first-run', '--autoplay-policy=no-user-gesture-required'];
if (process.env.EXT_ID) args.push(`--allowlisted-extension-id=${process.env.EXT_ID}`);
const b = await puppeteer.launch({ headless: false, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args });
console.log('chrome PID', b.process().pid);
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(new URL(swT.url()).host);
  const page = await b.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.bringToFront();
  await page.triggerExtensionAction(ext);
  const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
  const popup = await pt.asPage();
  const idSw = process.env.ID_DAL_SW ? await sw.evaluate(async (id) => chrome.tabCapture.getMediaStreamId({ targetTabId: id }), (await popup.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id))) : null;
  console.log('id dal service worker:', idSw && idSw.length);
  await dorme(500);
  const r = process.env.ALTRA_PAGINA ? {} : await popup.evaluate(async (SOLO_ID, idSw) => {
    const out = {};
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    out.tab = tab && { id: tab.id, url: tab.url };
    out.api = typeof chrome.tabCapture;
    // 1. capture() dalla pagina dell'estensione
    if (!SOLO_ID) out.capture = await new Promise((ok) => {
      try {
        chrome.tabCapture.capture({ audio: true, video: false }, (s) => ok(s ? `flusso con ${s.getAudioTracks().length} tracce` : `nessun flusso: ${chrome.runtime.lastError && chrome.runtime.lastError.message}`));
      } catch (e) {
        ok(`eccezione: ${e.message}`);
      }
    });
    // 2. getMediaStreamId + getUserMedia nella stessa pagina
    try {
      const id = idSw || (await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }));
      out.id = id.length;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } } });
        out.gum = `flusso con ${s.getAudioTracks().length} tracce`;
      } catch (e) {
        out.gum = `${e.name}: ${e.message}`;
      }
    } catch (e) {
      out.id = `eccezione: ${e.message}`;
    }
    return out;
  }, SOLO_ID, idSw);
  console.log(JSON.stringify(r, null, 1));
  if (process.env.ALTRA_PAGINA) {
    // id richiesto dal pannello, usato da un'altra pagina dell'estensione
    const idPannello = await popup.evaluate(async () => chrome.tabCapture.getMediaStreamId({ targetTabId: (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id }));
    const altra = await b.newPage();
    await altra.goto(`chrome-extension://${new URL(swT.url()).host}/diagnostica.html`);
    const g = await altra.evaluate(async (id) => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } } });
        return `flusso con ${s.getAudioTracks().length} tracce`;
      } catch (e) {
        return `${e.name}: ${e.message}`;
      }
    }, idPannello);
    console.log('id dal pannello, usato in un\'altra pagina:', g);
  }
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
