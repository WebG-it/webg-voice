// Banco di prova del motore (build di test), SOLO HEADLESS: costo della sintesi per lunghezza
// del blocco, prima sintesi dopo il caricamento, e quanti core usa davvero la sintesi
// (tempo di CPU dei processi di questa istanza diviso il tempo trascorso, solo Windows).
// Uso: CHROME=<Chrome for Testing> PROFILO=<profilo con la voce> [USCITE=...] node test/e2e/banco.mjs
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// secondi di CPU di tutti i processi figli dell'istanza (renderer, GPU, utility)
function cpu(pid) {
  if (process.platform !== 'win32') return NaN;
  const ps = `$t=0; Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} -or $_.ProcessId -eq ${pid} } | ForEach-Object { $t += $_.UserModeTime + $_.KernelModeTime }; $t`;
  return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()) / 1e7;
}

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  protocolTimeout: 1800000,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const pid = b.process().pid;
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
const R = {};
try {
  const sw = await (await b.waitForTarget((t) => t.type() === 'service_worker')).worker();
  if (!process.env.MOTORE_AUTO) await sw.evaluate(() => chrome.storage.local.set({ motoreLettura: 'massima' }));
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument()))
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'banco' });
  });
  const off = await (await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'))).asPage();
  await off.waitForFunction(() => globalThis.__test, { polling: 100 });
  const testo = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8');
  const FILI = process.env.FILI ? Number(process.env.FILI) : undefined;
  R.fili = FILI || 'predefiniti';
  const c0 = cpu(pid);
  const t0 = Date.now();
  R.opzioni = process.env.OPZIONI ? JSON.parse(process.env.OPZIONI) : undefined;
  R.banco = await off.evaluate((t, f, o) => __test.banco(t, undefined, 3, f, o), testo, FILI, R.opzioni);
  // campioni audio per confrontare i backend fuori dal browser
  for (const [n, w] of Object.entries(R.banco.wav || {})) writeFileSync(join(OUT, `${process.env.NOME || 'banco'}-${n}.wav`), Buffer.from(w, 'base64'));
  delete R.banco.wav;
  R.nan = R.banco.misure.reduce((a, m) => a + m.nan, 0);
  const sec = (Date.now() - t0) / 1000;
  R.coreMedi = +((cpu(pid) - c0) / sec).toFixed(2);
  R.stato = await off.evaluate(() => __test.stato().info);
  // riepilogo: millisecondi per fonema e costo fisso stimato (retta sui blocchi a regime)
  const regime = R.banco.misure.filter((m) => !m.prima);
  const n = regime.map((m) => m.n);
  const ms = regime.map((m) => m.ms);
  const mx = n.reduce((a, x) => a + x, 0) / n.length;
  const my = ms.reduce((a, x) => a + x, 0) / ms.length;
  const pend = n.reduce((a, x, i) => a + (x - mx) * (ms[i] - my), 0) / n.reduce((a, x) => a + (x - mx) ** 2, 0);
  R.retta = { msPerFonema: +pend.toFixed(2), costoFissoMs: Math.round(my - pend * mx) };
  R.perLunghezza = Object.values(
    regime.reduce((acc, m) => {
      const k = m.n;
      (acc[k] ||= { n: k, ms: [], sec: m.sec }).ms.push(m.ms);
      return acc;
    }, {})
  ).map((x) => ({ n: x.n, msMedi: Math.round(x.ms.reduce((a, y) => a + y, 0) / x.ms.length), secAudio: x.sec, rtf: +(x.ms.reduce((a, y) => a + y, 0) / x.ms.length / 1000 / x.sec).toFixed(2) }));
  log(JSON.stringify({ caricamentoMs: R.banco.caricamentoMs, prima: R.banco.misure[0], retta: R.retta, coreMedi: R.coreMedi, nan: R.nan, info: R.stato }));
  for (const r of R.perLunghezza) log(JSON.stringify(r));
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.errore = String(e.stack || e);
} finally {
  writeFileSync(join(OUT, `${process.env.NOME || 'banco'}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
}
