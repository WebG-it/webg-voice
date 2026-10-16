// Catture del pannello (popup.html a 340 px) negli stati principali, per la verifica visiva.
//   npm run build:test
//   CHROME=<chrome for testing> USCITE=<cartella> [SCURO=1] node test/e2e/popup-catture.mjs
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite', 'popup');
mkdirSync(OUT, { recursive: true });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const profilo = mkdtempSync(join(tmpdir(), 'popup-catture-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('non headless');
}
const COMANDI_OK = [
  { name: 'leggi-selezione', shortcut: 'Alt+Q' },
  { name: 'ferma-lettura', shortcut: 'Alt+W' },
  { name: 'dettatura', shortcut: 'Ctrl+Space' },
];
const STATI = {
  '1-riposo': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: { modello: 'normale' } } },
  '2-lettura': { s: { fase: 'lettura', blocco: 1, totale: 7, titolo: 'Un orto sul balcone', motorePronto: true }, d: { fase: 'inattiva', info: {} } },
  '3-dettatura-download': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', download: { scaricati: 158e6, totale: 251e6 } } },
  '3b-dettatura-download-in-corso': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'preparazione', download: { scaricati: 158e6, totale: 251e6 } } },
  '4-dettatura-ascolto': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'ascolto', info: {} } },
  '5-avviso-scorciatoia': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: {} }, comandi: [{ name: 'leggi-selezione', shortcut: '' }, ...COMANDI_OK.slice(1)] },
  '6-testo-incollato': { s: { fase: 'inattivo', motorePronto: true }, d: { fase: 'inattiva', info: {} }, incolla: true },
};
const esiti = {};
try {
  const t = await b.waitForTarget((x) => x.type() === 'service_worker', { timeout: 20000 });
  const id = new URL(t.url()).host;
  for (const [nome, st] of Object.entries(STATI)) {
    const p = await b.newPage();
    if (process.env.SCURO) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await p.setViewport({ width: 340, height: 200, deviceScaleFactor: 2 });
    await p.goto(`chrome-extension://${id}/popup.html`);
    await p.waitForFunction(() => globalThis.__testPopup);
    await dorme(600);
    await p.evaluate((st, ok) => {
      globalThis.__testFermo = true;
      const T = globalThis.__testPopup;
      T.mostraTasti(st.comandi || ok);
      T.mostra(st.s);
      T.mostraDettatura(st.d);
      if (st.incolla) {
        const d = document.getElementById('incolla');
        d.open = true;
        document.getElementById('testo').value = 'Per cominciare conviene puntare su piante facili: basilico, prezzemolo e lattuga.';
      }
    }, st, COMANDI_OK);
    await dorme(200);
    const altezza = await p.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
    esiti[nome] = altezza;
    await p.screenshot({ path: join(OUT, `${nome}${process.env.SCURO ? '-scuro' : ''}.png`), fullPage: true });
    await p.close();
  }
} finally {
  await b.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
console.log(JSON.stringify(esiti));
