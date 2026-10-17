// Scorciatoia senza selezione (1.5.1), SOLO HEADLESS: barretta e frase evidenziata nella pagina
// giusta, anche quando una lettura e' rimasta in pausa in un'altra scheda.
// Caso vero del 17-10: lettura in pausa la mattina, la sera Alt+Q su un articolo nuovo riprendeva
// la pausa vecchia (legata all'altra scheda): si sentiva leggere, ma senza barretta ne' evidenziazione.
// Uso: CHROME=<Chrome for Testing> PROFILO=<profilo con la voce> [URL=<articolo vero>] node test/e2e/scorciatoia-articolo.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ko = 0;
const ok = (n, c, d) => {
  if (!c) ko++;
  log(c ? 'OK  ' : 'NO  ', n, d !== undefined ? JSON.stringify(d).slice(0, 300) : '');
};

const paragrafi = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8').split('\n').filter((r) => r.trim());
const pagina = (titolo) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${titolo}</title></head>
<body style="font:18px/1.6 Georgia,serif;max-width:720px;margin:40px auto"><article><h1>${titolo}</h1>
${paragrafi.map((p) => `<p>${p}</p>`).join('\n')}</article></body></html>`;
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(pagina(q.url.includes('b') ? 'Un secondo articolo da leggere' : 'Un orto sul balcone'));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 900000,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'],
});
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  if (!process.env.MOTORE_AUTO) await sw.evaluate(() => chrome.storage.local.set({ motoreLettura: 'massima' }));
  const ext = (await b.extensions()).get(extId);
  const stato = async () => {
    const r = await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stato' }).catch(() => null));
    return r && r.stato;
  };
  const attendi = async (c, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (s && c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify(s && { fase: s.fase, tabId: s.tabId }));
      await dorme(200);
    }
  };
  const tabIdDi = (page) => page.evaluate(() => 0).then(() => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id));
  // la scorciatoia come la riceve il service worker (activeTab concesso aprendo e chiudendo il pannello)
  async function scorciatoia(page) {
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await (await pt.asPage()).close();
    await page.bringToFront();
    return sw.evaluate(() => globalThis.__testScorciatoia());
  }
  const barretta = (page) => page.evaluate(() => !!document.querySelector('[data-leggi-ad-alta-voce]'));
  const evidenziato = (page) =>
    page.evaluate(() => {
      const h = CSS.highlights.get('webg-voice-lettura');
      return h ? [...h].map((x) => x.toString().slice(0, 50)) : null;
    });
  async function attendiEvidenziato(page, ms = 60000) {
    const t0 = Date.now();
    for (;;) {
      const e = await evidenziato(page);
      if (e && e.length) return e;
      if (Date.now() - t0 > ms) return null;
      await dorme(250);
    }
  }
  async function apri(url) {
    const page = await b.newPage();
    page.on('pageerror', (e) => log('[pagina]', e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  // ---- 1. articolo con la scorciatoia: barretta e frase evidenziata ----
  const A = await apri(`${BASE}/a`);
  const idA = await tabIdDi(A);
  await scorciatoia(A);
  let s = await attendi((s) => s.fase === 'lettura');
  ok('A: lettura legata alla scheda', s.tabId === idA, { tabId: s.tabId, idA });
  ok('A: barretta', await barretta(A));
  ok('A: frase evidenziata', await attendiEvidenziato(A));

  // ---- 2. stessa pagina: la scorciatoia mette in pausa e riprende ----
  await scorciatoia(A);
  s = await attendi((s) => s.fase === 'pausa', 10000);
  ok('A: pausa', s.fase === 'pausa');
  await scorciatoia(A);
  s = await attendi((s) => s.fase === 'lettura' || s.fase === 'preparazione', 10000);
  ok('A: ripresa della stessa lettura', s.tabId === idA, { fase: s.fase, tabId: s.tabId });
  await scorciatoia(A);
  await attendi((s) => s.fase === 'pausa', 10000);

  // ---- 3. il caso del 17-10: pausa in A, scorciatoia su un articolo in un'altra scheda ----
  const B = await apri(`${BASE}/b`);
  const idB = await tabIdDi(B);
  await scorciatoia(B);
  s = await attendi((s) => s.tabId === idB && (s.fase === 'lettura' || s.fase === 'preparazione'), 60000).catch((e) => ({ errore: e.message }));
  ok('B: legge il suo articolo, non riprende la pausa di A', s.tabId === idB, s);
  s = await attendi((s) => s.fase === 'lettura', 60000);
  ok('B: titolo dell\'articolo B', /secondo articolo/i.test(s.titolo || ''), { titolo: s.titolo });
  ok('B: barretta', await barretta(B));
  const eB = await attendiEvidenziato(B);
  ok('B: frase evidenziata', eB, eB);
  await dorme(2500);
  ok('A: barretta tolta (la lettura di A e\' finita)', !(await barretta(A)));

  // ---- 4. una lettura che suona in B si mette in pausa anche dalla scheda A ----
  await scorciatoia(A);
  s = await attendi((s) => s.fase === 'pausa', 10000).catch((e) => ({ errore: e.message }));
  ok('A: la scorciatoia mette in pausa quello che si sente', s.fase === 'pausa' && s.tabId === idB, s && { fase: s.fase, tabId: s.tabId });

  // ---- 5. pausa in B, poi B ricaricata: la scorciatoia legge di nuovo la pagina, con la barretta ----
  await B.reload({ waitUntil: 'domcontentloaded' });
  await scorciatoia(B);
  s = await attendi((s) => s.fase === 'lettura', 60000);
  ok('B ricaricata: barretta', await barretta(B));
  ok('B ricaricata: frase evidenziata', await attendiEvidenziato(B));

  if (process.env.URL) {
    // pagine vere, ognuna da ferma (con una lettura che suona la scorciatoia metterebbe in pausa)
    for (const url of process.env.URL.split(',')) {
      await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stop' }).catch(() => null));
      await dorme(500);
      const P = await apri(url);
      await dorme(1500);
      await scorciatoia(P);
      await attendi((s) => s.fase === 'lettura', 120000);
      ok(`${url}: barretta`, await barretta(P));
      ok(`${url}: frase evidenziata`, await attendiEvidenziato(P), await evidenziato(P));
    }
  }
  await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stop' }).catch(() => null));
} finally {
  await b.close();
  server.close();
}
log(ko ? `${ko} KO` : 'tutto OK');
process.exit(ko ? 1 : 0);
