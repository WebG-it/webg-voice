// Prova di fumo della build di produzione (estensione/): il pannello mostra «Trascrivi la call» e,
// senza permessi, offre «Consenti e inizia» (i permessi tabCapture e downloads sono facoltativi).
//   CHROME=... node test/call/fumo-produzione.mjs   (headless, profilo temporaneo)
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const EXT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'estensione');
const VERSIONE = JSON.parse(readFileSync(join(EXT, '..', 'src', 'manifest.json'), 'utf8')).version;
const profilo = mkdtempSync(join(tmpdir(), 'call-fumo-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
let ko = 0;
const controlla = (n, c, d = '') => {
  if (!c) ko++;
  console.log(c ? 'OK ' : 'KO ', n, d);
};
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const id = new URL(swT.url()).host;
  const m = await (await swT.worker()).evaluate(() => chrome.runtime.getManifest());
  controlla('versione uguale a src/manifest.json', m.version === VERSIONE, m.version);
  // 1.7.0: alla prima installazione si apre la pagina di benvenuto (solo nella build di produzione)
  const benvenuto = await b.waitForTarget((t) => t.url() === `chrome-extension://${id}/benvenuto.html`, { timeout: 10000 }).catch(() => null);
  controlla('installazione: pagina di benvenuto aperta', !!benvenuto);
  if (benvenuto) {
    const bp = await benvenuto.asPage();
    await bp.waitForFunction(() => document.querySelector('kbd[data-comando]') && document.querySelector('kbd[data-comando]').textContent !== '…', { timeout: 10000 }).catch(() => {});
    const info = await bp.evaluate(() => ({ titolo: document.title, tasti: [...document.querySelectorAll('.giro kbd[data-comando]')].map((k) => k.textContent), pesi: [...document.querySelectorAll('td[data-peso]')].map((t) => t.textContent) }));
    controlla('benvenuto: scorciatoie vere e pesi', info.tasti.join() === 'Alt+Q,Alt+W,Ctrl+Spazio' && info.pesi.length === 5 && !info.pesi.some((x) => !/MB$/.test(x)), JSON.stringify(info));
  }
  controlla('permessi facoltativi', JSON.stringify(m.optional_permissions) === '["tabCapture","downloads"]', JSON.stringify(m.optional_permissions));
  controlla('permessi obbligatori senza tabCapture/downloads', !m.permissions.includes('tabCapture') && !m.permissions.includes('downloads'));
  const p = await b.newPage();
  await p.goto(`chrome-extension://${id}/popup.html`);
  await p.click('#chiamata');
  await p.waitForFunction(() => document.getElementById('chiamataBox').textContent.length > 20, { timeout: 15000 });
  const t = await p.evaluate(() => document.getElementById('chiamataBox').innerText);
  controlla('pannello: Consenti e inizia', /Consenti e inizia/.test(t), t.replace(/\n+/g, ' | ').slice(0, 160));
  controlla('pannello: consenso da spuntare', /Avviserò i partecipanti/.test(t));
  // cartella di salvataggio: si scrive, si normalizza, si ricorda
  await p.type('#chiamataCartella', 'Call clienti/../Torino');
  await p.$eval('#chiamataCartella', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 300));
  const salvata = await p.evaluate(async () => (await chrome.storage.local.get('chiamataCartella')).chiamataCartella);
  controlla('cartella scelta: normalizzata e salvata', salvata === 'Call clienti/Torino', JSON.stringify(salvata));
  await p.click('#chiamataChiediDove');
  await new Promise((r) => setTimeout(r, 300));
  const chiedi = await p.evaluate(async () => (await chrome.storage.local.get('chiamataChiediDove')).chiamataChiediDove);
  controlla('chiedi dove salvare: salvato, campo cartella disattivato', chiedi === true && (await p.$eval('#chiamataCartella', (e) => e.disabled)));
} finally {
  await b.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
process.exit(ko ? 1 : 0);
