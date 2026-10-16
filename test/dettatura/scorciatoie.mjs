// Quali scorciatoie Chrome assegna davvero all'estensione (un tasto gia' usato da Chrome resta vuoto).
//   CHROME=<chrome for testing> node test/dettatura/scorciatoie.mjs
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const EXT = process.env.EXT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'estensione-test');
const profilo = mkdtempSync(join(tmpdir(), 'scorciatoie-'));
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
try {
  const t = await b.waitForTarget((x) => x.type() === 'service_worker', { timeout: 20000 });
  const sw = await t.worker();
  console.log(JSON.stringify(await sw.evaluate(() => chrome.commands.getAll()), null, 1));
} finally {
  await b.close();
  rmSync(profilo, { recursive: true, force: true });
}
