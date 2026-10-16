// Misura la lettura sulla build di PRODUZIONE (nessun aggancio di test), SOLO HEADLESS.
// Primo suono a freddo (motore da caricare) e a caldo, poi un testo lungo letto tutto:
// buchi fra la fine di un blocco e l'inizio del successivo (numero, massimo, media su tutti i
// passaggi), rapporto col tempo reale, thread e isolamento davvero attivi nell'offscreen.
// Uso:
//   npm run build -- --uscita <cartella>          (o una copia di estensione/ di una versione)
//   EXT=<cartella> CHROME=<Chrome for Testing> PROFILO=<profilo> TESTO=<file .txt> \
//     [RTF=<rapporto salvato da simulare>] [USCITE=<cartella>] node test/e2e/misura-lettura.mjs
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const TESTO = readFileSync(process.env.TESTO || join(QUI, '..', 'testo-lungo.txt'), 'utf8');
const RTF = process.env.RTF ? Number(process.env.RTF) : undefined;
const VEL = Number(process.env.VELOCITA || 1);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
// memoria privata dei processi di questa istanza (solo Windows), in MB
const memoriaMB = (pid) => {
  if (process.platform !== 'win32') return null;
  const ps = `$t=0; Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} -or $_.ProcessId -eq ${pid} } | ForEach-Object { $t += $_.PrivatePageCount }; $t`;
  return Math.round(Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()) / 1048576);
};
const R = { ext: process.env.EXT, rtfSimulato: RTF ?? null, parole: TESTO.split(/\s+/).filter(Boolean).length };

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [process.env.EXT],
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
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const sw = await swT.worker();
  // la voce di Kokoro sempre (la scelta automatica potrebbe passare alla voce del sistema a PC carico)
  if (!process.env.MOTORE_AUTO) await sw.evaluate(() => chrome.storage.local.set({ motoreLettura: 'massima' }));
  const aOff = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }), tipo, extra);
  const crea = () =>
    sw.evaluate(async () => {
      if (!(await chrome.offscreen.hasDocument()))
        await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'misura' });
    });
  const stato = async () => {
    for (let i = 0; i < 20; i++) {
      try {
        const r = await aOff('stato');
        if (r && r.stato) return r.stato;
      } catch {}
      await dorme(100);
    }
    throw new Error('offscreen muto');
  };
  const attendi = async (c, ms = 900000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify(s).slice(0, 400));
      await dorme(100);
    }
  };
  const chiudiOffscreen = () => sw.evaluate(async () => { if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument(); });

  // 0. modello sul computer (in un profilo nuovo si scarica, una volta)
  await crea();
  await stato(); // l'offscreen deve aver caricato i suoi script prima del primo comando
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto || (s.download && s.download.interrotto), 900000);
  const off = await (await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'))).asPage();
  R.ambiente = await off.evaluate(() => ({ crossOriginIsolated, sharedArrayBuffer: typeof SharedArrayBuffer === 'function', processori: navigator.hardwareConcurrency }));
  R.motore = (await stato()).info;
  log('ambiente', JSON.stringify(R.ambiente), 'motore', JSON.stringify(R.motore));

  const FRASE = 'Buongiorno a tutti, questa è la prima frase della lettura, con una virgola, poi un\'altra, e infine il punto.';
  const leggi = async (testo) => {
    const t0 = Date.now();
    await aOff('leggi', { testo, velocita: VEL, rtf: RTF, t0 });
    const s = await attendi((s) => s.fase === 'lettura' || s.errore, 120000);
    return { s, ms: Date.now() - t0 };
  };

  // 1. a freddo: offscreen nuovo, motore da caricare (come dopo 10 minuti di riposo)
  await chiudiOffscreen();
  await dorme(1000);
  await crea();
  const f = await leggi(FRASE);
  R.freddo = { primoSuonoMs: f.s.metriche.primoSuonoMs, caricamentoMs: f.s.info && f.s.info.caricamentoMs, primaSintesiMs: (f.s.metriche.sintesiMs || [])[0] };
  await attendi((s) => s.fase === 'inattivo', 120000);
  log('freddo', JSON.stringify(R.freddo));

  // 1b. pannello aperto (dalla 1.2.0 il motore si carica all'apertura), lettura 3 secondi dopo
  if (process.env.PANNELLO) {
    await chiudiOffscreen();
    await dorme(1000);
    await crea();
    await aOff('prerisc');
    await dorme(3000);
    const p = await leggi(FRASE);
    R.pannello = { primoSuonoMs: p.s.metriche.primoSuonoMs };
    await attendi((s) => s.fase === 'inattivo', 120000);
    log('pannello', JSON.stringify(R.pannello));
  }

  // 2. a caldo, tre volte la stessa frase
  R.caldo = [];
  for (let i = 0; i < 3; i++) {
    const c = await leggi(FRASE);
    R.caldo.push({ primoSuonoMs: c.s.metriche.primoSuonoMs, sintesiMs: c.s.metriche.sintesiMs });
    await attendi((s) => s.fase === 'inattivo', 120000);
  }
  log('caldo', JSON.stringify(R.caldo.map((c) => c.primoSuonoMs)));
  // memoria a riposo: motore caricato e fermo, poi senza motore
  await dorme(5000);
  R.memoria = { motoreFermoMB: memoriaMB(pid) };
  await chiudiOffscreen();
  await dorme(3000);
  R.memoria.senzaMotoreMB = memoriaMB(pid);
  log('memoria', JSON.stringify(R.memoria));
  await crea();
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto, 120000);

  // 3. testo lungo letto tutto
  const t0 = Date.now();
  const l = await leggi(TESTO);
  const fine = await attendi((s) => s.fase === 'inattivo' || s.errore, 3 * 3600000);
  const m = fine.metriche;
  const passaggi = Math.max(1, fine.totale - 1);
  const buchi = m.buchiSec || [];
  R.lungo = {
    primoSuonoMs: l.s.metriche.primoSuonoMs,
    blocchi: fine.totale,
    secondiAudio: m.secondiAudio,
    durataS: Math.round((Date.now() - t0) / 1000),
    rtf: fine.rtf,
    buchi: buchi.length,
    buchiMaxS: buchi.length ? Math.max(...buchi) : 0,
    buchiMediaS: +(buchi.reduce((a, x) => a + x, 0) / passaggi).toFixed(3),
    buchiSommaS: +buchi.reduce((a, x) => a + x, 0).toFixed(2),
    buchiSec: buchi,
    sintesiMs: m.sintesiMs,
    errore: fine.errore,
  };
  log('lungo', JSON.stringify({ ...R.lungo, sintesiMs: undefined, buchiSec: undefined }));
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.errore = String(e.stack || e);
} finally {
  const nome = process.env.NOME || 'misura';
  writeFileSync(join(OUT, `${nome}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
  log('fine, istanza chiusa');
}
