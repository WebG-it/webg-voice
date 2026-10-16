// Pagina della dettatura con uno stato salvato da versioni precedenti (come nel profilo di Marco).
//   CHROME=<chrome> [EXT=<cartella estensione>] [STATO=<json per chrome.storage.local>] node test/dettatura/stato-salvato.mjs
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const EXT = process.env.EXT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'estensione-test');
const STATO = JSON.parse(process.env.STATO || '{"dettModello":"leggero","dettMisuraPC":{"cpu":30.3,"gpu":45.4,"quando":1792145514757},"rtf":1.1,"velocita":1.1}');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const profilo = mkdtempSync(join(tmpdir(), 'stato-salvato-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
let esito = 1;
try {
  const t = await b.waitForTarget((x) => x.type() === 'service_worker', { timeout: 20000 });
  const id = new URL(t.url()).host;
  const sw = await t.worker();
  await sw.evaluate((s) => chrome.storage.local.set(s), STATO);
  const p = await b.newPage();
  p.on('console', (m) => console.log('[pagina]', m.type(), m.text().slice(0, 300)));
  p.on('pageerror', (e) => console.log('[errore pagina]', e.message));
  await p.goto(`chrome-extension://${id}/dettatura.html#modello`);
  await dorme(8000);
  const r = await p.evaluate(() => ({
    mic: document.querySelector('#micStato').textContent,
    scelto: [...document.querySelectorAll('input[name="modello"]')].filter((x) => x.checked).map((x) => x.value),
    stato: document.querySelector('#modelloStato').textContent,
    consigliato: [...document.querySelectorAll('.consigliato')].map((x) => x.closest('label').querySelector('input').value),
  }));
  // la build WebGPU di ONNX Runtime (asyncify) non deve partire se non si sceglie Qualita'
  const motori = b.targets().map((x) => x.url()).filter((u) => u.includes('dettatura-worker.js'));
  r.motori = motori.map((u) => u.replace(/^.*\//, ''));
  console.log(JSON.stringify(r, null, 1));
  esito = r.mic.startsWith('Controllo') || !r.scelto.length || motori.some((u) => u.includes('ep=webgpu')) ? 1 : 0;
} finally {
  await b.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
console.log(esito ? 'KO' : 'OK');
process.exit(esito);
