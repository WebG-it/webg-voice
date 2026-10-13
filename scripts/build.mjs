// Prepara la cartella estensione/, quella da caricare in Chrome.
// Copia i sorgenti di src/ e le librerie (ONNX Runtime Web da node_modules,
// eSpeak NG compilato da vendor/). Niente bundler: sono moduli ES nativi.
// Uso: npm run build
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RADICE } from './versione.mjs';

export function costruisci() {
  const out = join(RADICE, 'estensione');
  const ort = join(RADICE, 'node_modules', 'onnxruntime-web');
  if (!existsSync(ort)) throw new Error('Manca onnxruntime-web: lancia prima "npm install".');

  rmSync(out, { recursive: true, force: true });
  cpSync(join(RADICE, 'src'), out, { recursive: true });

  mkdirSync(join(out, 'vendor', 'ort'), { recursive: true });
  for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    cpSync(join(ort, 'dist', f), join(out, 'vendor', 'ort', f));
  }
  mkdirSync(join(out, 'vendor', 'espeak'), { recursive: true });
  for (const f of ['espeak-ng.mjs', 'espeak-ng.wasm', 'espeak-dati.bin', 'espeak-dati.json', 'COPYING']) {
    cpSync(join(RADICE, 'vendor', 'espeak', f), join(out, 'vendor', 'espeak', f));
  }
  for (const f of ['LICENSE', 'THIRD_PARTY.md']) cpSync(join(RADICE, f), join(out, f));

  let totale = 0;
  const giro = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const s = statSync(p);
      if (s.isDirectory()) giro(p);
      else totale += s.size;
    }
  };
  giro(out);
  return totale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = costruisci();
  console.log(`estensione/ pronta: ${(t / 1048576).toFixed(1)} MB`);
}
