// Partenza a freddo (build di test), SOLO HEADLESS: per ogni variante di opzioni di sessione chiude
// e riapre l'offscreen, misura le fasi del caricamento, la memoria dei processi dell'istanza
// (prima del motore, a motore caricato e fermo, dopo una sintesi) e la velocita' di sintesi.
// Uso: CHROME=... PROFILO=<profilo con la voce> [VARIANTI='[{"nome":"base"}]'] node test/e2e/freddo.mjs
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const VARIANTI = process.env.VARIANTI
  ? JSON.parse(process.env.VARIANTI)
  : [
      { nome: 'base' },
      { nome: 'senza arena', opzioni: { enableCpuMemArena: false } },
      { nome: 'ottimizzazione extended', opzioni: { graphOptimizationLevel: 'extended' } },
      { nome: 'ottimizzazione basic', opzioni: { graphOptimizationLevel: 'basic' } },
      { nome: 'base (controllo)' },
    ];
const RIPETI = Number(process.env.RIPETI || 2);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const testo = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8');
  let ultimoOff = null;
  // modello sul computer prima delle misure (in un profilo nuovo si scarica, una volta)
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument()))
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'freddo' });
  });
  {
    const t0 = await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'));
    const p0 = await t0.asPage();
    await p0.waitForFunction(() => globalThis.__test, { polling: 50 });
    await p0.evaluate(() => __test.avvia(null));
    ultimoOff = t0;
  }
  for (let giro = 0; giro < RIPETI; giro++) {
    for (const v of VARIANTI) {
      await sw.evaluate(async () => {
        if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
      });
      await dorme(2500);
      const vuota = memoriaMB(pid);
      await sw.evaluate(async () => {
        if (!(await chrome.offscreen.hasDocument()))
          await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'freddo' });
      });
      const offT = await b.waitForTarget((t) => t.url().endsWith('/offscreen.html') && t !== ultimoOff);
      ultimoOff = offT;
      const off = await offT.asPage();
      await off.waitForFunction(() => globalThis.__test, { polling: 50 });
      const a = await off.evaluate((o) => __test.avvia(o), v.opzioni || null);
      await dorme(3000);
      const carico = memoriaMB(pid);
      const banco = await off.evaluate((t) => __test.banco(t, [30, 150], 2), testo);
      const regime = banco.misure.filter((m) => !m.prima);
      const ms30 = Math.round(regime.filter((m) => m.n < 60).reduce((s, m) => s + m.ms, 0) / regime.filter((m) => m.n < 60).length);
      const ms150 = Math.round(regime.filter((m) => m.n >= 60).reduce((s, m) => s + m.ms, 0) / regime.filter((m) => m.n >= 60).length);
      await dorme(3000);
      const dopo = memoriaMB(pid);
      const r = { giro, variante: v.nome, avvioMs: a.ms, fasi: a.info && a.info.fasi, primaSintesiMs: banco.misure[0].ms, blocco30Ms: ms30, blocco150Ms: ms150, memoriaSenzaMotoreMB: vuota, memoriaMotoreFermoMB: carico, memoriaDopoSintesiMB: dopo };
      R.push(r);
      log(JSON.stringify(r));
    }
  }
} catch (e) {
  console.error('ERRORE', e.stack || e);
} finally {
  writeFileSync(join(OUT, `${process.env.NOME || 'freddo'}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
}
