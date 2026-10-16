// Misura Whisper in ONNX Runtime Web (WASM e WebGPU) in Chrome for Testing headless.
//   npm i --no-save puppeteer
//   CHROME=<chrome for testing> MODELLI=<cartella con small/, turbo/...> AUDIO=<cartella con i wav> node test/dettatura/banco.mjs
// PROVE='small:encoder_model_int8_corto.onnx:decoder_model_merged_int8.onnx:wasm:var' (separate da virgola;
// "var" = finestra variabile, serve l'encoder ritoccato da scripts/accorcia-encoder.py)
// FILE=c1_Diego,... (nomi dei wav senza estensione)  RIPETI=2  FILI=8  MARGINE=1  PROMPT='...'  USCITA=<file.json>
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODELLI = process.env.MODELLI;
const AUDIO = process.env.AUDIO;
const FILE = (process.env.FILE || 'c1_Diego,c2_Elsa,c3_Diego,m1_Diego,m2_Elsa,m3_Isabella,l1_Diego,l2_Elsa').split(',');
const PROMPT = process.env.PROMPT ?? 'WebG, Joomla, YOOtheme, recensionidimarco, Home Assistant, Kian, Aldo.';
const RIPETI = +(process.env.RIPETI || 2);
const CONF = {
  base: { nMel: 80, teste: 8, dimTesta: 64, layer: 6 },
  small: { nMel: 80, teste: 12, dimTesta: 64, layer: 12 },
  turbo: { nMel: 128, teste: 20, dimTesta: 64, layer: 4 },
};
const TIPI = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
};
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
const BASE = `http://127.0.0.1:${server.address().port}`;
const profilo = mkdtempSync(join(tmpdir(), 'banco-dettatura-'));
const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  executablePath: process.env.CHROME,
  userDataDir: profilo,
  args: ['--no-first-run', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza non headless, interrotta');
}
console.log('chrome headless PID', b.process().pid);
const risultati = [];
try {
  for (const prova of (process.env.PROVE || 'small:encoder_model_int8_corto.onnx:decoder_model_merged_int8.onnx:wasm:var').split(',')) {
    const [mod, enc, dec, ep, varr] = prova.split(':');
    const p = await b.newPage();
    p.on('console', (m) => m.type() === 'error' && console.log('[pagina]', m.text().slice(0, 300)));
    await p.goto(`${BASE}/test/dettatura/banco.html`);
    await p.waitForFunction(() => window.pronto);
    if (ep === 'webgpu') {
      const a = await p.evaluate(async () => {
        const a = navigator.gpu && (await navigator.gpu.requestAdapter());
        return a ? JSON.stringify(a.info || {}) : null;
      });
      console.log('adattatore WebGPU', a);
    }
    const c = await p.evaluate((m) => chiedi(m), {
      tipo: 'carica',
      base: `/modelli/${mod}`,
      encoder: enc,
      decoder: dec,
      ep,
      variabile: varr === 'var',
      fili: +(process.env.FILI || 8),
      ...CONF[mod],
    });
    console.log(`\n== ${prova}`, JSON.stringify(c).slice(0, 400));
    if (!c.ok) {
      await p.close();
      continue;
    }
    for (let k = 0; k < RIPETI; k++) {
      for (const f of FILE) {
        const r = await p.evaluate((m) => chiedi(m), { tipo: 'trascrivi', url: `/audio/${f}.wav`, prompt: PROMPT, margine: +(process.env.MARGINE || 1) });
        if (!r.ok) {
          console.log(f, r.errore.slice(0, 400));
          continue;
        }
        const rtf = (r.msTotali / 1000 / r.secAudio).toFixed(2);
        console.log(
          `${k} ${f.padEnd(12)} ${String(r.secAudio).padStart(5)}s mel ${r.msMel} enc ${r.msEncoder} dec ${r.msDecoder} (${r.token} tok) tot ${r.msTotali} RTF ${rtf} nosp ${r.probSilenzio} lp ${r.logprobMedio} | ${r.testo}`
        );
        if (k === RIPETI - 1) risultati.push({ prova, file: f, ...r });
      }
    }
    await p.close();
  }
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
if (process.env.USCITA) writeFileSync(process.env.USCITA, JSON.stringify(risultati, null, 1));
