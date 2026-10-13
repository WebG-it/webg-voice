// Uso (solo Chrome headless, nessuna finestra):
//   npm i --no-save puppeteer
//   CHROME=<percorso di Chrome for Testing> PROFILO=<cartella profilo di prova> USCITE=<cartella> node test/e2e/headless.mjs
// Chrome di marca non accetta piu' --load-extension: serve Chrome for Testing
// (npx @puppeteer/browsers install chrome@stable).
// Prova completa SOLO HEADLESS: nessuna finestra visibile. Uso:
//   (profilo nuovo = prova anche conferma, download, interruzione e ripresa)
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test'); // build con gli hook di test: npm run build:test
const CHROME = process.env.CHROME;
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const HTML = readFileSync(join(QUI, 'articolo.html'), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const R = { errori: [] };

const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_P = `http://127.0.0.1:${server.address().port}/`;

const opzioni = {
  headless: true, // = --headless=new
  pipe: true,
  enableExtensions: [EXT],
  executablePath: CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check'],
};
const b = await puppeteer.launch(opzioni);
const pid = b.process().pid;
const argomenti = b.process().spawnargs.join(' ');
if (!/--headless(=new)?\b/.test(argomenti)) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
log('istanza headless PID', pid);

try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(extId);
  b.on('targetdestroyed', (t) => { if (t.url().includes('offscreen')) log('offscreen chiuso'); });

  const offscreen = async () => {
    const t = await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'), { timeout: 30000 });
    const p = await t.asPage();
    if (!p.__a) {
      p.__a = 1;
      p.on('console', (m) => ['error', 'warn'].includes(m.type()) && R.errori.push(`[off] ${m.text()}`));
      p.on('pageerror', (e) => R.errori.push(`[off] ${e.message}`));
    }
    await p.waitForFunction(() => globalThis.__test, { timeout: 30000, polling: 200 });
    return p;
  };
  const stato = (o) => o.evaluate(() => __test.stato());
  const attendi = async (o, c, ms = 600000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato(o);
      if (c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify(s));
      await dorme(200);
    }
  };
  const comando = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }), tipo, extra);

  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL_P);
  const seleziona = (q) => page.evaluate((q) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(q)); getSelection().removeAllRanges(); getSelection().addRange(r); }, q);

  // Popup aperto dall'azione dell'estensione (concede activeTab), Leggi a campo vuoto = selezione
  async function apriPopup() {
    for (const t of b.targets()) if (t.url().endsWith('/popup.html')) { try { await (await t.asPage()).close(); } catch {} }
    await dorme(300);
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const t = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    const p = await t.asPage();
    await p.waitForSelector('#play');
    await dorme(400);
    return p;
  }
  async function leggiSelezione(q) {
    await seleziona(q);
    const p = await apriPopup();
    await p.$eval('#testo', (e) => { e.value = ''; });
    await p.click('#play');
    return p;
  }

  // 1) primo uso: conferma prima del download
  let pop;
  if (process.env.SENZA_POPUP) await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'background', tipo: 'leggiTesto', testo: 'Prova di lettura.' }).catch(() => {}));
  else pop = await leggiSelezione('#testo p:nth-of-type(1)');
  const off = await offscreen();
  const s1 = await attendi(off, (s) => s.fase === 'consenso' || s.fase === 'lettura' || s.errore, 30000);
  R.primoUso = s1.fase;
  log('primo uso:', s1.fase);
  if (s1.fase === 'consenso') {
    await page.screenshot({ path: join(OUT, 'consenso.png') });
    await pop.screenshot({ path: join(OUT, 'popup-consenso.png') });
    if (process.env.VIA_SW) await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'consenti' }));
    else await pop.click('#scarica');
    const sd = await attendi(off, (s) => (s.download && s.download.scaricati > 60e6) || (s.download && s.download.interrotto), 300000);
    if (sd.download.interrotto) {
      throw new Error('download fallito: ' + sd.download.dettaglio);
    }
    R.fonte = sd.download.fonte;
    await page.screenshot({ path: join(OUT, 'download.png') });
    // interruzione della rete e ripresa
    await off.setOfflineMode(true);
    const si = await attendi(off, (s) => s.download && s.download.interrotto, 120000);
    R.interrottoMB = Math.round(si.download.scaricati / 1e6);
    await page.screenshot({ path: join(OUT, 'interrotto.png') });
    await off.setOfflineMode(false);
    pop = await apriPopup();
    await pop.waitForSelector('#scarica:not([hidden])');
    R.popupInterrotto = await pop.$eval('#statoTesto', (e) => e.textContent);
    await pop.screenshot({ path: join(OUT, 'popup-interrotto.png') });
    await pop.click('#scarica');
    const sr = await attendi(off, (s) => s.download && !s.download.interrotto && s.download.scaricati > 0, 60000);
    R.ripresaDaMB = Math.round(sr.download.scaricati / 1e6);
    log('interrotto a', R.interrottoMB, 'MB, ripreso da', R.ripresaDaMB, 'MB');
  }
  const s2 = await attendi(off, (s) => s.fase === 'lettura' || s.errore, 600000);
  R.inLettura = { errore: s2.errore, info: s2.info, versione: s2.versione };
  await dorme(1500);
  await page.screenshot({ path: join(OUT, 'store-1-lettura.png') });
  await comando('pausa');
  await dorme(500);
  R.pausa = (await stato(off)).fase;
  await page.screenshot({ path: join(OUT, 'pausa.png') });
  await comando('riprendi');
  await dorme(500);
  R.ripresa = (await stato(off)).fase;
  await comando('stop');
  await dorme(1000);
  R.stop = (await stato(off)).fase;
  log('pausa/ripresa/stop:', R.pausa, R.ripresa, R.stop);

  // 2) popup con testo incollato (schermata)
  pop = await apriPopup();
  await pop.$eval('#testo', (e) => { e.value = 'Per cominciare conviene puntare su piante facili: basilico, prezzemolo, lattuga da taglio e ravanelli crescono in fretta.'; });
  await pop.click('#play');
  await attendi(off, (s) => s.fase === 'lettura');
  await dorme(800);
  await pop.screenshot({ path: join(OUT, 'store-popup.png') });
  await comando('stop');
  await dorme(800);

  // 3) tema scuro
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  pop = await leggiSelezione('#testo p:nth-of-type(3)');
  await attendi(off, (s) => s.fase === 'lettura');
  await pop.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await dorme(1200);
  await page.screenshot({ path: join(OUT, 'store-4-scuro.png') });
  await pop.screenshot({ path: join(OUT, 'popup-scuro.png') });
  await comando('stop');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await dorme(800);

  // 4) articolo intero, misure
  pop = await leggiSelezione('#testo');
  const t4 = Date.now();
  const s4 = await attendi(off, (s) => s.fase === 'lettura');
  const s5 = await attendi(off, (s) => s.fase === 'inattivo');
  R.articolo = { primoSuonoMs: s4.metriche.primoSuonoMs, blocchi: s5.totale, rtf: s5.rtf, buchi: s5.metriche.buchi || 0, buchiSec: s5.metriche.buchiSec || [], durataMs: Date.now() - t4 };
  const reg = await off.evaluate(() => __test.registrazioneWav());
  R.articolo.secondiAudio = +reg.secondi.toFixed(1);
  log('articolo:', JSON.stringify(R.articolo));

  // 5) diagnostica
  const dia = await b.newPage();
  await dia.setViewport({ width: 1280, height: 800 });
  await dia.goto(`chrome-extension://${extId}/diagnostica.html`);
  await dia.click('#avvia');
  await dia.waitForFunction(() => globalThis.__risultatoDiagnostica, { timeout: 300000, polling: 500 });
  R.diagnostica = await dia.evaluate(() => __testoDiagnostica());
  log('diagnostica:\n' + R.diagnostica);
  await dia.screenshot({ path: join(OUT, 'store-5-diagnostica.png') });
  await dia.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await dia.screenshot({ path: join(OUT, 'diagnostica-scuro.png') });
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.erroreTest = String(e.stack || e);
} finally {
  writeFileSync(join(OUT, 'risultati.json'), JSON.stringify(R, null, 2));
  try { await b.close(); } catch {}
  try { process.kill(pid); } catch {}
  server.close();
  log('fine, istanza chiusa');
}
