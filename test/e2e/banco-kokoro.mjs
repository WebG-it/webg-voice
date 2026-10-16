// Banco dei modelli Kokoro: rapporto sintesi/tempo reale di ogni variante (fp32, fp16, q8, q4...)
// su WebAssembly e WebGPU, con o senza carico (test/e2e/stress-cpu.mjs lanciato a parte), e
// l'audio dello stesso paragrafo per confrontare la qualita' a orecchio.
//   npm run build:test
//   CHROME=<chrome for testing> KOKORO=<cartella con model*.onnx e if_sara.bin> [USCITE=<cartella wav>] \
//     PROVE='model.onnx:wasm,model_quantized.onnx:wasm' [RIPETI=2] [FILI=8] node test/e2e/banco-kokoro.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = process.env.EXT || join(RADICE, 'estensione-test');
const KOKORO = process.env.KOKORO;
const OUT = process.env.USCITE;
if (OUT) mkdirSync(OUT, { recursive: true });
const PARAGRAFO =
  process.env.PARAGRAFO ||
  "Per cominciare conviene puntare su piante facili: basilico, prezzemolo, lattuga da taglio e ravanelli crescono in fretta e perdonano qualche dimenticanza. " +
    "Il balcone esposto a sud riceve sole per gran parte della giornata, quindi d'estate bisogna annaffiare la sera, quando la terra non scotta piu'. " +
    "Se lo spazio e' poco, i vasi appesi e le fioriere strette lungo la ringhiera raddoppiano la superficie coltivabile senza togliere posto per sedersi.";
const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  let f;
  if (u === '/') {
    r.writeHead(200, { 'content-type': 'text/html', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    return r.end('<!doctype html><meta charset="utf-8"><title>banco</title>');
  }
  if (u.startsWith('/ext/')) f = join(EXT, u.slice(5));
  else if (u.startsWith('/kokoro/')) f = join(KOKORO, u.slice(8));
  else if (u.startsWith('/test/')) f = join(RADICE, u.slice(1));
  if (!f || !existsSync(f) || statSync(f).isDirectory()) return r.writeHead(404).end();
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
const profilo = mkdtempSync(join(tmpdir(), 'banco-kokoro-'));
const b = await puppeteer.launch({ headless: true, pipe: true, executablePath: process.env.CHROME, userDataDir: profilo, protocolTimeout: 900000, args: ['--no-first-run', '--enable-unsafe-webgpu'] });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('non headless');
}
const risultati = [];
try {
  for (const prova of (process.env.PROVE || 'model.onnx:wasm').split(',')) {
    const [modello, ep] = prova.split(':');
    const p = await b.newPage();
    await p.goto(`${BASE}/`);
    await p.evaluate(() => {
      const w = new Worker('/test/e2e/banco-kokoro-worker.js', { type: 'module' });
      let n = 0;
      const att = new Map();
      w.onmessage = (e) => {
        const a = att.get(e.data.id);
        att.delete(e.data.id);
        a(e.data);
      };
      window.chiedi = (m) => new Promise((r) => { const id = ++n; att.set(id, r); w.postMessage({ ...m, id }); });
    });
    const c = await p.evaluate((m) => chiedi(m), { tipo: 'prepara', modello, ep, fili: +(process.env.FILI || 8) });
    if (!c.ok) {
      console.log(prova, 'ERRORE', c.errore.slice(0, 300));
      risultati.push({ prova, errore: c.errore.slice(0, 300) });
      await p.close();
      continue;
    }
    const rtf = [];
    let ultimo;
    for (let k = 0; k < +(process.env.RIPETI || 2); k++) {
      ultimo = await p.evaluate((m) => chiedi(m), { tipo: 'paragrafo', testo: PARAGRAFO, wav: !!OUT && k === 0 });
      if (!ultimo.ok) break;
      rtf.push(ultimo.rtf);
      if (ultimo.wav) writeFileSync(join(OUT, `${modello.replace('.onnx', '')}-${ep}.wav`), Buffer.from(ultimo.wav, 'base64'));
    }
    const r = { prova, mb: Math.round(statSync(join(KOKORO, modello)).size / 1e6), caricamentoMs: c.caricamentoMs, rtf, secondi: ultimo && ultimo.secondi, errore: ultimo && ultimo.errore };
    console.log(JSON.stringify(r));
    risultati.push(r);
    await p.close();
  }
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
if (process.env.RISULTATI) writeFileSync(process.env.RISULTATI, JSON.stringify(risultati, null, 1));
