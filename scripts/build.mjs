// Prepara la cartella estensione/, quella da caricare in Chrome.
// Copia i sorgenti di src/ e le librerie (ONNX Runtime Web da node_modules,
// eSpeak NG compilato da vendor/). Niente bundler: sono moduli ES nativi.
// Uso: npm run build         -> estensione/ (produzione, senza hook di test)
//      npm run build:test    -> estensione-test/ (con gli hook per test/e2e, non si committa)
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RADICE } from './versione.mjs';

// I blocchi fra "@@test-inizio" e "@@test-fine" servono solo ai test automatici
// (globalThis.__test, richieste a URL arbitrari, svuotamento dell'archivio):
// nella build di produzione si tolgono.
const BLOCCO_TEST = /[ \t]*\/\/ @@test-inizio[\s\S]*?\/\/ @@test-fine[^\n]*\n?/g;

function ripulisci(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'vendor') continue;
    if (statSync(p).isDirectory()) ripulisci(p);
    else if (n.endsWith('.js')) {
      const t = readFileSync(p, 'utf8');
      const r = t.replace(BLOCCO_TEST, '');
      if (/@@test|__test|provaFonte|svuotaCache/.test(r)) throw new Error(`hook di test rimasti in ${n}`);
      if (r !== t) writeFileSync(p, r);
    }
  }
}

export function costruisci({ test = false } = {}) {
  const out = join(RADICE, test ? 'estensione-test' : 'estensione');
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
  for (const f of ['LICENSE', 'LICENSE-APACHE-2.0.txt', 'THIRD_PARTY.md']) cpSync(join(RADICE, f), join(out, f));
  if (test) {
    for (const lingua of readdirSync(join(out, '_locales'))) {
      const f = join(out, '_locales', lingua, 'messages.json');
      const m = JSON.parse(readFileSync(f, 'utf8'));
      m.nomeEstensione.message += ' (TEST)';
      writeFileSync(f, JSON.stringify(m, null, 2));
    }
  } else ripulisci(out);

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
  const test = process.argv.includes('--test');
  const t = costruisci({ test });
  console.log(`${test ? 'estensione-test' : 'estensione'}/ pronta: ${(t / 1048576).toFixed(1)} MB`);
}
