// Catture per la scheda dello store (1.7.0), SOLO HEADLESS e senza scaricare modelli: gli stati
// (lettura, dettatura, call) si mandano alla pagina come li manderebbe l'estensione, con gli
// stessi script veri (barra.js, dettatura-pagina.js, chiamata-pagina.js) e il pannello vero.
// Poi `python scripts/immagini-store.py <USCITE>` compone le immagini 1280x800.
//   npm run build:test
//   CHROME=<chrome for testing> PROFILO=<profilo nuovo> USCITE=<cartella> node test/e2e/catture-store.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite', 'store');
mkdirSync(OUT, { recursive: true });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const ARTICOLO = readFileSync(join(QUI, 'articolo.html'), 'utf8');
const POSTA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Nuovo messaggio</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f3f4f7;color:#1f2430}
.app{display:grid;grid-template-columns:220px 1fr;height:100vh}.lato{background:#e9ebf1;padding:22px 16px}
.lato b{display:block;font-size:18px;margin-bottom:18px;color:#3a4a6b}.lato div{padding:7px 10px;border-radius:8px;color:#4a5468}
.lato .su{background:#d6dbe8;color:#1f2430;font-weight:600}.corpo{padding:40px 56px}
.mail{background:#fff;border-radius:12px;box-shadow:0 2px 10px #0001;max-width:760px;padding:22px 26px}
.riga{border-bottom:1px solid #e5e7ee;padding:9px 0;color:#5b6478}.riga b{color:#1f2430;font-weight:500}
textarea{width:100%;box-sizing:border-box;min-height:300px;border:0;font:16px/1.6 system-ui,sans-serif;margin-top:16px;resize:none;outline:none;color:#1f2430}</style></head>
<body><div class="app"><div class="lato"><b>Posta</b><div class="su">Nuovo messaggio</div><div>Posta in arrivo</div><div>Inviata</div><div>Bozze</div></div>
<div class="corpo"><div class="mail"><div class="riga">A: <b>Laura Bianchi</b></div><div class="riga">Oggetto: <b>Preventivo per il sito nuovo</b></div>
<textarea id="campo" aria-label="Messaggio"></textarea></div></div></div></body></html>`;
const CALL = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Riunione settimanale</title>
<style>body{margin:0;background:#202124;color:#e8eaed;font:14px system-ui,sans-serif;height:100vh;display:flex;flex-direction:column}
.griglia{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:70px 24px 12px}
.p{border-radius:12px;display:flex;align-items:flex-end;padding:14px;font-weight:500;position:relative;overflow:hidden}
.p span{position:relative}.p i{position:absolute;inset:0;display:grid;place-items:center;font-style:normal;font-size:64px;font-weight:600;color:#fff8}
.barra{height:72px;display:flex;align-items:center;justify-content:center;gap:14px}
.barra b{width:44px;height:44px;border-radius:50%;background:#3c4043;display:inline-block}.barra b.r{background:#ea4335;width:64px;border-radius:22px}</style></head>
<body><div class="griglia">
<div class="p" style="background:#5b6b8c"><i>LB</i><span>Laura Bianchi</span></div>
<div class="p" style="background:#6b8c6b"><i>PN</i><span>Paolo Neri</span></div>
<div class="p" style="background:#8c6b5b"><i>GV</i><span>Giulia Verdi</span></div>
<div class="p" style="background:#4a4f57"><i>Tu</i><span>Tu</span></div></div>
<div class="barra"><b></b><b></b><b class="r"></b><b></b></div></body></html>`;

const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(q.url.startsWith('/posta') ? POSTA : q.url.startsWith('/call') ? CALL : ARTICOLO);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars'],
});
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
const COMANDI = [
  { name: 'leggi-selezione', shortcut: 'Alt+Q' },
  { name: 'ferma-lettura', shortcut: 'Alt+W' },
  { name: 'dettatura', shortcut: 'Ctrl+Space' },
];
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const id = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(id);
  async function apri(url, { scuro = false, w = 1280, h = 800 } = {}) {
    const p = await b.newPage();
    p.on('pageerror', (e) => log('[pagina]', e.message));
    if (scuro) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto(url, { waitUntil: 'load' });
    return p;
  }
  // activeTab sulla scheda, come quando l'utente apre il pannello
  async function concedi(p) {
    await p.bringToFront();
    await p.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await (await pt.asPage()).close();
    await p.bringToFront();
    return sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  }
  // il pannello vero, aperto come pagina (360 px, a doppia densita' per una resa nitida), in uno stato dato
  async function pannello(nome, st, prima) {
    const p = await b.newPage();
    if (st.scuro) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await p.setViewport({ width: 360, height: 300, deviceScaleFactor: 2 });
    await p.goto(`chrome-extension://${id}/popup.html`);
    await p.waitForFunction(() => globalThis.__testPopup);
    await dorme(700);
    if (prima) await prima(p);
    await p.evaluate(
      (st, comandi) => {
        globalThis.__testFermo = true;
        const T = globalThis.__testPopup;
        T.mostraTasti(comandi);
        T.mostra(st.s);
        T.mostraDettatura(st.d);
        if (st.ultimo) document.getElementById('rileggiUltimo').disabled = false;
        // nelle immagini dello store il nome senza il segno della build di prova
        document.getElementById('nome').textContent = 'WebG Voice';
      },
      st,
      COMANDI
    );
    await dorme(400);
    await p.screenshot({ path: join(OUT, `${nome}.png`), fullPage: true });
    log('pannello', nome);
    await p.close();
  }

  // ---- 1. lettura di un articolo: barretta, frase evidenziata, pannello ----
  const A = await apri(`${BASE}/articolo`);
  const tA = await concedi(A);
  await sw.evaluate(async (tab) => {
    await chrome.scripting.executeScript({ target: { tabId: tab }, files: ['barra.js'] });
    const stato = { fase: 'lettura', velocita: 1.1, blocco: 2, totale: 7, titolo: 'Un orto sul balcone in cinque mosse', impronta: 'x' };
    await chrome.tabs.sendMessage(tab, { da: 'offscreen', tipo: 'stato', stato });
    await chrome.storage.local.set({ evidenzia: true });
    await chrome.tabs.sendMessage(tab, {
      da: 'offscreen',
      tipo: 'evidenzia',
      testo: 'Per cominciare conviene puntare su piante facili: basilico, prezzemolo, lattuga da taglio e ravanelli crescono in fretta e perdonano qualche dimenticanza.',
      nuova: true,
      articolo: true,
    });
  }, tA);
  await dorme(900);
  await A.screenshot({ path: join(OUT, 'pagina-lettura.png') });
  await A.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await dorme(400);
  await A.screenshot({ path: join(OUT, 'pagina-lettura-scuro.png') });
  await A.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  log('pagina lettura');

  await pannello('pannello-lettura', { s: { fase: 'lettura', blocco: 2, totale: 7, titolo: 'Un orto sul balcone in cinque mosse', motorePronto: true }, d: { fase: 'inattiva', info: {} }, ultimo: true });
  await pannello('pannello-riposo', { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: {} }, ultimo: true });
  await pannello('pannello-riposo-scuro', { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: {} }, ultimo: true, scuro: true });
  await pannello('pannello-primo-avvio', { s: { fase: 'inattivo', download: { scaricati: 141e6, totale: 326e6 } }, d: { fase: 'inattiva' } });

  // ---- 2. dettatura in un campo: indicatore verde e testo scritto ----
  const P = await apri(`${BASE}/posta`);
  await P.click('#campo');
  await concedi(P);
  await P.click('#campo');
  await sw.evaluate(() => globalThis.__testDettaturaPagina());
  await sw.evaluate(async () => {
    await globalThis.__testDettato('buongiorno Laura virgola a capo le mando il preventivo per il sito nuovo come d\'accordo ieri punto', 2);
    await globalThis.__testDettato('se va bene possiamo partire lunedì punto', 2);
  });
  await dorme(800);
  const tP = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  await sw.evaluate(async (tab) => {
    await chrome.tabs.sendMessage(tab, { dett: 'stato', stato: { fase: 'parlato' } }).catch(() => {});
    await chrome.tabs.sendMessage(tab, { dett: 'livello', v: 0.62 }).catch(() => {});
  }, tP);
  await dorme(500);
  await P.screenshot({ path: join(OUT, 'pagina-dettatura.png') });
  log('pagina dettatura', await P.$eval('#campo', (c) => c.value.slice(0, 80)));

  // ---- 3. call: barretta rossa nella scheda e pannello con il file salvato ed Esporta come ----
  const C = await apri(`${BASE}/call`);
  const tC = await concedi(C);
  await sw.evaluate(async (tab) => {
    await chrome.scripting.executeScript({ target: { tabId: tab }, files: ['chiamata-pagina.js'] });
    await chrome.tabs.sendMessage(tab, { chiam: 'avvia', stato: { inizio: Date.now() - 754000 } });
    await chrome.tabs.sendMessage(tab, { chiam: 'livello', liv: { Call: 0.7, Io: 0.25 } });
  }, tC);
  await dorme(1200);
  await C.screenshot({ path: join(OUT, 'pagina-call.png') });
  log('pagina call');
  const md = '# Riunione settimanale\n\n- Data: 4 novembre 2026, dalle 10:00 alle 10:42 (42 min)\n\n**[00:05] Call:** Buongiorno a tutti.\n';
  await sw.evaluate(async (md) => {
    const nomeFile = 'Riunione settimanale 2026-11-04 10-00.md';
    await chrome.storage.local.set({ chiamataUltima: { nomeFile, righe: 214, lacune: 0, quando: Date.now(), salvata: true, inCorso: false }, chiamataConsenso: true });
    await chrome.storage.session.set({ chiamataEsporta: { nomeFile, testo: md, quando: Date.now() } });
  }, md);
  await pannello('pannello-call', { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: {} }, ultimo: true }, async (p) => {
    // modello gia' sul computer, come dopo il primo uso (qui non si scarica niente)
    await p.evaluate(() => {
      const vero = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (m, ...r) =>
        m && m.tipo === 'chiamataStato' ? Promise.resolve({ attiva: false, concessi: true, modelloPronto: true, stato: null }) : vero(m, ...r);
    });
    await p.click('#chiamata');
    await dorme(1500);
    // per l'immagine conta il riquadro della call: il resto del pannello si nasconde
    await p.evaluate(() => {
      for (const s of ['#chiamataOpz', '.regola', '#statoBox', '#incolla', '.strumenti']) document.querySelector(s).hidden = true;
    });
  });

  // ---- 4. benvenuto, guida, impostazioni ----
  for (const [nome, pagina, scuro] of [
    ['benvenuto', 'benvenuto.html', false],
    ['benvenuto-scuro', 'benvenuto.html', true],
    ['guida', 'guida.html', false],
    ['opzioni', 'diagnostica.html', false],
    ['opzioni-scuro', 'diagnostica.html', true],
    ['dettatura-pagina', 'dettatura.html', false],
  ]) {
    const p = await apri(`chrome-extension://${id}/${pagina}`, { scuro });
    await dorme(900);
    await p.evaluate(() => document.querySelectorAll('h1').forEach((h) => (h.textContent = h.textContent.replace(' (TEST)', ''))));
    await p.screenshot({ path: join(OUT, `${nome}.png`) });
    log('pagina', nome);
    await p.close();
  }
} finally {
  await b.close();
  server.close();
}
log('catture in', OUT);
