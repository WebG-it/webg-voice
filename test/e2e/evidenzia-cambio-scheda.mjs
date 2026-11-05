// Evidenziazione dopo un cambio di scheda (1.7.0), SOLO HEADLESS.
// Caso segnalato il 18-10 sulla 1.5.1: lettura di un articolo in A, si passa a B e si preme la
// scorciatoia due volte: la prima mette in pausa, la seconda fa partire una lettura, e quella
// lettura non ha piu' nessuna frase evidenziata. Controlla CSS.highlights nella scheda che legge.
// Varianti: B con un articolo (seconda pressione = lettura di B), B senza articolo (si torna in A
// e si riprende), pressioni ravvicinate.
// Uso: CHROME=<Chrome for Testing> PROFILO=<profilo nuovo> node test/e2e/evidenzia-cambio-scheda.mjs
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
const articolo = (titolo, quanti = paragrafi.length) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${titolo}</title></head>
<body style="font:18px/1.6 Georgia,serif;max-width:720px;margin:40px auto"><article><h1>${titolo}</h1>
${paragrafi.slice(0, quanti).map((p) => `<p>${p}</p>`).join('\n')}</article></body></html>`;
const vuota = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Posta</title></head><body><nav>Posta in arrivo</nav><button>Scrivi</button></body></html>';
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (q.url.startsWith('/vuota')) return r.end(vuota);
  if (q.url.startsWith('/b')) return r.end(articolo('Un secondo articolo da leggere'));
  if (q.url.startsWith('/c')) return r.end(articolo('Un terzo articolo breve', 2));
  r.end(articolo('Un orto sul balcone'));
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
  let giri = 0;
  const attendi = async (c, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (s && c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify(s && { fase: s.fase, tabId: s.tabId }));
      if (++giri % 100 === 0) log('  aspetto…', JSON.stringify(s && { fase: s.fase, download: s.download, errore: s.errore }));
      await dorme(200);
    }
  };
  const tabIdDi = (page) => page.evaluate(() => 0).then(() => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id));
  async function attivaTab(page) {
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await (await pt.asPage()).close();
    await page.bringToFront();
  }
  // la scorciatoia come la riceve il service worker (activeTab concesso aprendo e chiudendo il pannello)
  async function scorciatoia(page, attiva = true) {
    if (attiva) await attivaTab(page);
    return sw.evaluate(() => globalThis.__testScorciatoia());
  }
  const nascosta = (page) => page.evaluate(() => document.hidden);
  const evidenziato = (page) =>
    page.evaluate(() => {
      const h = CSS.highlights.get('webg-voice-lettura');
      return h ? [...h].map((x) => x.toString().slice(0, 50)) : null;
    });
  async function attendiEvidenziato(page, ms = 30000) {
    const t0 = Date.now();
    for (;;) {
      const e = await evidenziato(page);
      if (e && e.length) return e;
      if (Date.now() - t0 > ms) return null;
      await dorme(250);
    }
  }
  // la frase evidenziata cambia mentre la lettura va avanti (l'evidenziazione segue la voce)
  async function segue(page, ms = 40000) {
    const prima = await attendiEvidenziato(page, ms);
    if (!prima) return false;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await dorme(500);
      const ora = await evidenziato(page);
      if (ora && ora[0] !== prima[0]) return true;
    }
    return false;
  }
  async function apri(url) {
    const page = await b.newPage();
    page.on('pageerror', (e) => log('[pagina]', e.message));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }
  const ferma = async () => {
    await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stop' }).catch(() => null));
    await dorme(800);
  };

  // ---- 0. prima lettura (al primo giro aspetta il download della voce) ----
  const A = await apri(`${BASE}/a`);
  const idA = await tabIdDi(A);
  await scorciatoia(A);
  let s = await attendi((s) => s.fase === 'lettura', 900000);
  ok('A: lettura con evidenziazione', await attendiEvidenziato(A));

  // ---- 1. il caso del 18-10: A legge, si passa a B (articolo), scorciatoia due volte ----
  const B = await apri(`${BASE}/b`);
  const idB = await tabIdDi(B);
  await attivaTab(B);
  ok('1: A nascosta dopo il cambio di scheda', await nascosta(A));
  await scorciatoia(B, false);
  s = await attendi((s) => s.fase === 'pausa', 10000);
  ok('1: la prima pressione in B mette in pausa A', s.tabId === idA, { fase: s.fase, tabId: s.tabId });
  await scorciatoia(B, false);
  s = await attendi((s) => s.fase === 'lettura' && s.tabId === idB, 60000).catch((e) => ({ errore: e.message }));
  ok('1: la seconda pressione legge B', s.tabId === idB, s && { fase: s.fase, tabId: s.tabId });
  const e1 = await attendiEvidenziato(B);
  ok('1: frase evidenziata in B', e1, e1);
  ok('1: l\'evidenziazione segue la voce in B', await segue(B));
  ok('1: niente evidenziazione rimasta in A', !(await evidenziato(A)), await evidenziato(A));

  // ---- 2. pressioni ravvicinate (doppio tocco) da una scheda all'altra, piu' volte ----
  for (let giro = 1; giro <= Number(process.env.GIRI || 8); giro++) {
    const [verso, idVerso] = giro % 2 ? [A, idA] : [B, idB];
    await attivaTab(verso);
    await scorciatoia(verso, false);
    await dorme(80 + 40 * (giro % 4));
    await scorciatoia(verso, false);
    s = await attendi((s) => s.fase === 'lettura' && s.tabId === idVerso, 60000).catch((e) => ({ errore: e.message }));
    const e2 = await attendiEvidenziato(verso);
    ok(`2.${giro}: doppia pressione, la scheda che legge evidenzia`, s.tabId === idVerso && e2, { tabId: s.tabId, e: e2 });
  }

  // ---- 3. B senza articolo: due pressioni, si torna in A e si riprende ----
  await ferma();
  await scorciatoia(A);
  await attendi((s) => s.fase === 'lettura' && s.tabId === idA, 60000);
  await attendiEvidenziato(A);
  const P = await apri(`${BASE}/vuota`);
  await attivaTab(P);
  await scorciatoia(P, false);
  s = await attendi((s) => s.fase === 'pausa', 10000);
  await scorciatoia(P, false);
  await dorme(800);
  s = await stato();
  ok('3: pagina senza articolo, la lettura di A resta in pausa', s.fase === 'pausa' && s.tabId === idA, { fase: s.fase, tabId: s.tabId });
  await attivaTab(A);
  await scorciatoia(A, false);
  s = await attendi((s) => s.fase === 'lettura', 10000);
  ok('3: ripresa in A con evidenziazione che segue', await segue(A));

  // ---- 4. articolo breve: la lettura nuova parte subito dopo quella vecchia ----
  const C = await apri(`${BASE}/c`);
  const idC = await tabIdDi(C);
  await attivaTab(C);
  await scorciatoia(C, false);
  await attendi((s) => s.fase === 'pausa', 10000);
  await scorciatoia(C, false);
  s = await attendi((s) => s.fase === 'lettura' && s.tabId === idC, 60000).catch((e) => ({ errore: e.message }));
  ok('4: articolo breve evidenziato', await attendiEvidenziato(C));
  await ferma();
} finally {
  await b.close();
  server.close();
}
log(ko ? `${ko} KO` : 'tutto OK');
process.exit(ko ? 1 : 0);
