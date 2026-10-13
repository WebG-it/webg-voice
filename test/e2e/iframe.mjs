// Uso (solo Chrome headless, nessuna finestra):
//   npm i --no-save puppeteer
//   CHROME=<percorso di Chrome for Testing> PROFILO=<cartella profilo di prova> USCITE=<cartella> node test/e2e/iframe.mjs
// Chrome di marca non accetta piu' --load-extension: serve Chrome for Testing
// (npx @puppeteer/browsers install chrome@stable).
// Prova HEADLESS della lettura della selezione in iframe ed editor:
// TinyMCE (iframe stessa origine), textarea, CodeMirror 5, iframe di altra origine.
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test'); // build con gli hook di test: npm run build:test
const CHROME = process.env.CHROME;
const NM = process.env.NODE_MODULES || join(QUI, '..', '..', 'node_modules');
mkdirSync(process.env.USCITE || join(QUI, 'uscite'), { recursive: true });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const TIPI = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };

const altro = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><meta charset="utf-8"><body><p id="x">Questo paragrafo sta in un riquadro di un altro sito.</p></body>');
});
await new Promise((r) => altro.listen(0, '127.0.0.1', r));
const ALTRO = `http://localhost:${altro.address().port}/`; // localhost vs 127.0.0.1: origine diversa

const PAGINA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<link rel="stylesheet" href="/nm/codemirror/lib/codemirror.css">
<script src="/nm/tinymce/tinymce.min.js"></script><script src="/nm/codemirror/lib/codemirror.js"></script></head>
<body style="font:16px system-ui;max-width:900px;margin:20px auto">
<h1>Modifica articolo</h1>
<textarea id="ed"><p>Il testo dentro l'editor TinyMCE di Joomla deve essere letto.</p><p>Secondo paragrafo dell'editor.</p></textarea>
<h2>Campo di testo</h2>
<textarea id="ta" rows="3" cols="80">Questa è una normale area di testo con una frase da leggere.</textarea>
<h2>Codice</h2>
<textarea id="cm">Una riga di testo dentro CodeMirror.</textarea>
<h2>Riquadro esterno</h2>
<iframe id="est" src="${ALTRO}" width="600" height="80"></iframe>
<script>
  tinymce.init({ selector: '#ed', license_key: 'gpl', base_url: '/nm/tinymce', suffix: '.min', menubar: false, height: 220 });
  window.cm = CodeMirror.fromTextArea(document.getElementById('cm'), { lineNumbers: true });
</script></body></html>`;

const server = http.createServer((q, r) => {
  if (q.url.startsWith('/nm/')) {
    try {
      const f = join(NM, decodeURIComponent(q.url.slice(4).split('?')[0]));
      const b = readFileSync(f);
      r.writeHead(200, { 'content-type': TIPI[extname(f)] || 'application/octet-stream' });
      return r.end(b);
    } catch {
      r.writeHead(404);
      return r.end();
    }
  }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGINA);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  executablePath: CHROME,
  userDataDir: process.env.PROFILO,
});
const pid = b.process().pid;
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza non headless');
}
const R = {};
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker');
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(extId);
  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.tinymce && tinymce.activeEditor && tinymce.activeEditor.initialized, { timeout: 20000 });
  await dorme(800);

  const pulisci = async () => {
    for (const f of page.frames()) await f.evaluate(() => getSelection().removeAllRanges()).catch(() => {});
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  };
  async function leggiConPopup() {
    for (const t of b.targets()) if (t.url().endsWith('/popup.html')) { try { await (await t.asPage()).close(); } catch {} }
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const t = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    const p = await t.asPage();
    await p.waitForSelector('#play');
    await dorme(300);
    await p.$eval('#testo', (e) => { e.value = ''; });
    await p.click('#play');
    await dorme(2500);
    const msg = await p.$eval('#statoTesto', (e) => e.textContent).catch(() => '');
    const ot = b.targets().find((x) => x.url().endsWith('/offscreen.html'));
    let testo = null;
    if (ot) {
      const o = await ot.asPage();
      await o.waitForFunction(() => globalThis.__test, { polling: 200 });
      const bl = await o.evaluate(() => __test.blocchi());
      testo = bl.map((x) => x.testo).join(' ');
      await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stop' }));
      await o.evaluate(() => { const L = __test; return L; }).catch(() => {});
    }
    return { testo, popup: msg };
  }

  // 1) TinyMCE: selezione dentro l'iframe dell'editor, editor col focus
  await pulisci();
  await page.evaluate(() => {
    const ed = tinymce.activeEditor;
    ed.focus();
    ed.selection.select(ed.getBody().firstChild, true);
  });
  R.tinymce = await leggiConPopup();
  console.log('TinyMCE:', JSON.stringify(R.tinymce));

  // 2) textarea normale
  await pulisci();
  await page.evaluate(() => { const t = document.getElementById('ta'); t.focus(); t.setSelectionRange(12, 40); });
  R.textarea = await leggiConPopup();
  console.log('textarea:', JSON.stringify(R.textarea));

  // 3) CodeMirror 5
  await pulisci();
  await page.evaluate(() => { cm.focus(); cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 23 }); });
  R.codemirror = await leggiConPopup();
  console.log('CodeMirror:', JSON.stringify(R.codemirror));

  // 4) iframe di un'altra origine
  await pulisci();
  const fe = page.frames().find((f) => f.url().startsWith(ALTRO));
  await fe.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('x')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  R.altraOrigine = await leggiConPopup();
  console.log('altra origine:', JSON.stringify(R.altraOrigine));

  // 5) selezione nella pagina principale mentre l'editor ha altro testo: vince la pagina
  await pulisci();
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('h1')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  R.principale = await leggiConPopup();
  console.log('pagina principale:', JSON.stringify(R.principale));
  await page.screenshot({ path: join(process.env.USCITE || join(QUI, 'uscite'), 'iframe.png') });
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.errore = String(e);
} finally {
  writeFileSync(join(process.env.USCITE || join(QUI, 'uscite'), 'iframe.json'), JSON.stringify(R, null, 2));
  await b.close().catch(() => {});
  try { process.kill(pid); } catch {}
  server.close();
  altro.close();
}
