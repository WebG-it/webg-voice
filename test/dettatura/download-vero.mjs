// Download vero da internet del modello della dettatura (niente server locale): deve arrivare dalla
// release GitHub dettatura-v1 con l'encoder corto, non dalla riserva di Hugging Face.
//   CHROME=<chrome> [MODELLO=normale] node test/dettatura/download-vero.mjs
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const EXT = process.env.EXT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'estensione-test');
const MODELLO = process.env.MODELLO || 'normale';
const profilo = mkdtempSync(join(tmpdir(), 'download-vero-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
let esito = 1;
try {
  const t = await b.waitForTarget((x) => x.type() === 'service_worker', { timeout: 20000 });
  const id = new URL(t.url()).host;
  const p = await b.newPage();
  const fonti = new Set();
  p.on('console', () => {});
  await p.goto(`chrome-extension://${id}/dettatura.html`);
  await p.evaluate(() => {
    window.fonti = new Set();
    chrome.runtime.onMessage.addListener((m) => {
      if (m && m.tipo === 'statoDettatura' && m.stato.download && m.stato.download.fonte) window.fonti.add(m.stato.download.file + ' <- ' + m.stato.download.fonte);
    });
  });
  const t0 = Date.now();
  const r = await p.evaluate((m) => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaScarica', modello: m }), MODELLO);
  for (const f of await p.evaluate(() => [...window.fonti])) fonti.add(f);
  console.log(JSON.stringify({ secondi: Math.round((Date.now() - t0) / 1000), ok: r.ok, errore: r.errore, info: r.info, misura: r.misura, fonti: [...fonti] }, null, 1));
  esito = r.ok && r.info && r.info.finestraVariabile && [...fonti].every((f) => f.endsWith('github.com')) ? 0 : 1;
} finally {
  await b.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
console.log(esito ? 'KO' : 'OK');
process.exit(esito);
