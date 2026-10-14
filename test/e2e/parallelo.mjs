// Banco: piu' motori di sintesi in parallelo (build di test), SOLO HEADLESS.
// Misura la capacita' complessiva (rapporto col tempo reale su blocchi da 150 fonemi) e la
// memoria dei processi dell'istanza per ogni combinazione "motori x thread".
// Uso: CHROME=... PROFILO=<profilo con la voce> [PROVE="1x8,2x4,2x6,3x4"] node test/e2e/parallelo.mjs
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const PROVE = (process.env.PROVE || '1x8,2x4,2x6,3x4,1x8').split(',').map((x) => x.split('x').map(Number));
const OPZIONI = process.env.OPZIONI ? JSON.parse(process.env.OPZIONI) : undefined;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const memoriaMB = (pid) => {
  const ps = `$t=0; Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} -or $_.ProcessId -eq ${pid} } | ForEach-Object { $t += $_.PrivatePageCount }; $t`;
  return Math.round(Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()) / 1048576);
};

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 1800000,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const pid = b.process().pid;
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
const R = [];
try {
  const sw = await (await b.waitForTarget((t) => t.type() === 'service_worker')).worker();
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument()))
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'banco' });
  });
  const off = await (await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'))).asPage();
  await off.waitForFunction(() => globalThis.__test, { polling: 100 });
  const testo = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8');
  for (const [n, f] of PROVE) {
    const prima = memoriaMB(pid);
    let picco = prima;
    const t = setInterval(() => {
      try {
        picco = Math.max(picco, memoriaMB(pid));
      } catch {}
    }, 3000);
    const r = await off.evaluate((t, n, f, o) => __test.parallelo(t, n, f, 12, 150, o), testo, n, f, OPZIONI);
    clearInterval(t);
    r.memoriaPiccoMB = picco;
    r.memoriaPrimaMB = prima;
    R.push(r);
    log(JSON.stringify(r));
  }
} catch (e) {
  console.error('ERRORE', e.stack || e);
} finally {
  writeFileSync(join(OUT, `${process.env.NOME || 'parallelo'}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
}
