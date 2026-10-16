// Voce pronta nel tempo (build di test), SOLO HEADLESS: una lettura, poi MINUTI minuti di uso
// simulato di Chrome (schede aperte e cambiate ogni minuto), poi una nuova lettura. Ogni minuto
// annota se il documento offscreen e' ancora aperto e la memoria dei processi dell'istanza.
// Con ATTIVITA=0 non simula l'uso: serve a vedere quando si libera da solo.
// Uso: CHROME=... PROFILO=<profilo con la voce> [MINUTI=20] [ATTIVITA=1] node test/e2e/riposo.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const MINUTI = Number(process.env.MINUTI || 20);
const ATTIVITA = process.env.ATTIVITA !== '0';
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const memoriaMB = (pid) => {
  const ps = `$t=0; Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} -or $_.ProcessId -eq ${pid} } | ForEach-Object { $t += $_.PrivatePageCount }; $t`;
  return Math.round(Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()) / 1048576);
};
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(`<!doctype html><title>Pagina ${q.url}</title><p>Pagina di prova ${q.url}, per simulare l'uso di Chrome.</p>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_P = `http://127.0.0.1:${server.address().port}`;

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 600000,
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
log('istanza headless PID', pid);
const R = { minuti: MINUTI, attivita: ATTIVITA, campioni: [] };
try {
  const sw = await (await b.waitForTarget((t) => t.type() === 'service_worker')).worker();
  if (!process.env.MOTORE_AUTO) await sw.evaluate(() => chrome.storage.local.set({ motoreLettura: 'massima' }));
  const aOff = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }).catch(() => null), tipo, extra);
  const aperto = () => sw.evaluate(() => chrome.offscreen.hasDocument());
  const stato = async () => {
    for (let i = 0; i < 30; i++) {
      const r = await aOff('stato');
      if (r && r.stato) return r.stato;
      await dorme(100);
    }
    return null;
  };
  const attendi = async (c, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (s && c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await dorme(100);
    }
  };
  const FRASE = 'Buongiorno, questa è una lettura di prova per vedere quanto resta pronta la voce.';
  // una lettura vera, partita dal service worker come fa la scorciatoia
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'prova' });
  });
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto, 600000);
  await aOff('leggi', { testo: FRASE, velocita: 1, t0: Date.now() });
  const s0 = await attendi((s) => s.fase === 'lettura');
  R.primaLettura = s0.metriche.primoSuonoMs;
  await attendi((s) => s.fase === 'inattivo');
  const t0 = Date.now();
  const pagine = [await b.newPage()];
  for (let m = 1; m <= MINUTI; m++) {
    // un minuto di "uso": ogni 20 secondi si apre o si cambia scheda
    for (let k = 0; k < 3; k++) {
      if (ATTIVITA) {
        if (pagine.length < 4) {
          const p = await b.newPage();
          await p.goto(`${URL_P}/${m}-${k}`);
          pagine.push(p);
        } else {
          const p = pagine[(m + k) % pagine.length];
          await p.bringToFront();
          await p.goto(`${URL_P}/${m}-${k}`);
        }
      }
      await dorme(20000);
    }
    const c = { minuto: m, offscreen: await aperto(), memoriaMB: memoriaMB(pid) };
    R.campioni.push(c);
    log(JSON.stringify(c));
  }
  R.minutiReali = +((Date.now() - t0) / 60000).toFixed(1);
  const pronta = await aperto();
  const t = Date.now();
  if (!pronta) {
    await sw.evaluate(async () => {
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'prova' });
    });
  }
  await aOff('leggi', { testo: FRASE, velocita: 1, t0: t });
  const s1 = await attendi((s) => s.fase === 'lettura');
  R.dopo = { offscreenAncoraAperto: pronta, primoSuonoMs: s1.metriche.primoSuonoMs, memoriaMB: memoriaMB(pid) };
  log('dopo', JSON.stringify(R.dopo));
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.errore = String(e.stack || e);
} finally {
  writeFileSync(join(OUT, `${process.env.NOME || 'riposo'}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
  server.close();
}
