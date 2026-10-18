// Banco Parakeet TDT v3 int8 in ONNX Runtime Web (WASM), Chrome for Testing headless.
//   CHROME=... MODELLI=<cartella con parakeet/> AUDIO=<cartella wav> [FILE=01,02] [FILI=8] [USCITA=json] node test/call/banco-parakeet.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { MODELLI, AUDIO } = process.env;
const FILE = (process.env.FILE || readdirSync(AUDIO).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)).join(',')).split(',');
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.wav': 'audio/wav' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  let f;
  if (u.startsWith('/ort/')) f = join(RADICE, 'node_modules', 'onnxruntime-web', 'dist', u.slice(5));
  else if (u.startsWith('/modelli/')) f = join(MODELLI, u.slice(9));
  else if (u.startsWith('/audio/')) f = join(AUDIO, u.slice(7));
  else f = join(RADICE, u.slice(1));
  if (!existsSync(f) || statSync(f).isDirectory()) {
    r.writeHead(404);
    r.end();
    return;
  }
  r.writeHead(200, {
    'content-type': TIPI[extname(f)] || 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
    'content-length': statSync(f).size,
  });
  createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profilo = mkdtempSync(join(tmpdir(), 'banco-parakeet-'));
const b = await puppeteer.launch({ headless: true, pipe: true, executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run', ...(process.env.GC ? ['--js-flags=--expose-gc'] : [])] });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza non headless, interrotta');
}
console.log('chrome headless PID', b.process().pid);
const ris = [];
/** Memoria privata del processo piu' grande fra quelli del Chrome lanciato da noi (MB). */
function memoriaMax(pid) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `$all=Get-CimInstance Win32_Process; $ids=@(${pid}); do{$n=$all|?{$ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId}|%{$_.ProcessId}; $ids+=$n}while($n); ($ids|%{(Get-Process -Id $_ -ErrorAction SilentlyContinue).PrivateMemorySize64}|Measure-Object -Maximum).Maximum/1MB`], { encoding: 'utf8' });
    return Math.round(parseFloat(out.trim()));
  } catch {
    return null;
  }
}
try {
  const p = await b.newPage();
  p.on('console', (m) => m.type() === 'error' && console.log('[pagina]', m.text().slice(0, 300)));
  await p.goto(`http://127.0.0.1:${server.address().port}/test/call/parakeet.html`);
  await p.waitForFunction(() => window.pronto);
  const c = await p.evaluate((m) => chiedi(m), { tipo: 'carica', fili: +(process.env.FILI || 8), opzioni: process.env.OPZIONI ? JSON.parse(process.env.OPZIONI) : undefined });
  console.log('memoria dopo il caricamento (processo piu grande):', memoriaMax(b.process().pid), 'MB');
  if (process.env.GC) {
    await new Promise((r) => setTimeout(r, 4000));
    await p.evaluate(() => chiedi({ tipo: 'gc' }));
    await new Promise((r) => setTimeout(r, 2000));
    console.log('memoria dopo gc (processo piu grande):', memoriaMax(b.process().pid), 'MB');
  }
  console.log('carica', JSON.stringify(c).slice(0, 600));
  if (c.ok)
    for (const f of FILE) {
      const r = await p.evaluate((m) => chiedi(m), { tipo: 'trascrivi', url: `/audio/${f}.wav` });
      if (!r.ok) {
        console.log(f, r.errore.slice(0, 500));
        continue;
      }
      console.log(`${f.padEnd(10)} ${String(r.secAudio).padStart(5)}s mel ${r.msMel} enc ${r.msEncoder} dec ${r.msDecoder} tot ${r.msTotali} RTF ${(r.msTotali / 1000 / r.secAudio).toFixed(2)} lp ${r.logprobMedio} min ${r.logprobMin} | ${r.testo}`);
      ris.push({ file: f, ...r });
    }
  console.log('memoria alla fine (processo piu grande):', memoriaMax(b.process().pid), 'MB');
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
if (process.env.USCITA) writeFileSync(process.env.USCITA, JSON.stringify(ris, null, 1));
