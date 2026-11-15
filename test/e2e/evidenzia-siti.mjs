// Quanto spesso la frase in lettura e' evidenziata su siti veri (issue #3), SOLO HEADLESS.
// Per ogni sito: Leggi tutto l'articolo, poi per DURATA secondi si guarda CSS.highlights.
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


  const SITI = (process.env.SITI || [
    'https://www.webg.it/blog/244-realizzazione-siti-vetrina-la-guida-completa.html',
    'https://it.wikipedia.org/wiki/Terremoto_dell%27Irpinia_del_1980',
    'https://www.ilpost.it/2026/10/13/ex-ilva-decreto-legge-cassa-integrazione-lavoratori/',
    'https://www.scossaditerremoto.it/lista-terremoti/lista-usgs/24499-terremoto-magnitudo-6-7-dorsale-medio-atlantica.html',
  ].join(' ')).split(' ');
  const DURATA = Number(process.env.DURATA || 25) * 1000;
  for (const url of SITI) {
    const page = await b.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
      await attivaTab(page);
      await sw.evaluate(() => globalThis.__testMenuArticolo());
      await attendi((s) => s.fase === 'lettura', 120000);
      let si = 0, n = 0, prima = null, cambi = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < DURATA) {
        const e = await evidenziato(page);
        n++;
        if (e && e.length) { si++; if (e[0] !== prima) { cambi++; prima = e[0]; } }
        await dorme(500);
      }
      const s = await stato();
      const prova = await page.evaluate(() => [document.documentElement.dataset.webgProva, document.documentElement.dataset.webgChiamate]);
      ok(new URL(url).host, si / n >= 0.85 && cambi >= 2, { quota: +(si / n).toFixed(2), cambi, blocco: s.blocco, totale: s.totale, prova });
    } catch (e) {
      ok(new URL(url).host, false, e.message);
    }
    await ferma();
    await page.close();
  }
} finally {
  await b.close();
  server.close();
}
log(ko ? `${ko} KO` : 'tutto OK');
process.exit(ko ? 1 : 0);
