// Confronta i fonemi prodotti in JavaScript (espeak WASM) con quelli di
// kokoro-onnx in Python sullo stesso corpus.
// Uso: node test/confronta-fonemi.mjs [riferimento.json] [cartella espeak-ng-data]
// Il riferimento di default (test/riferimento-python.json) e' stato prodotto con
// kokoro-onnx 0.6.1: Kokoro.tokenizer.phonemize(frase, "it") per ogni frase del corpus.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { avviaEspeak } from '../src/lib/espeak.js';
import { creaFonemizzatore } from '../src/lib/fonemi.js';
import { daCartella } from '../scripts/dati-espeak.mjs';

const qui = dirname(fileURLToPath(import.meta.url));
const ve = join(qui, '..', 'vendor', 'espeak');
const creaModulo = (await import('../vendor/espeak/espeak-ng.mjs')).default;
const pacco = process.argv[3]
  ? daCartella(process.argv[3])
  : { indice: JSON.parse(readFileSync(join(ve, 'espeak-dati.json'), 'utf8')), dati: new Uint8Array(readFileSync(join(ve, 'espeak-dati.bin'))) };
const clausole = await avviaEspeak({
  creaModulo,
  wasm: new Uint8Array(readFileSync(join(ve, 'espeak-ng.wasm'))),
  indice: pacco.indice,
  dati: pacco.dati,
});
const fonemizza = creaFonemizzatore(clausole);
const corpus = JSON.parse(readFileSync(join(qui, 'corpus.json'), 'utf8'));
const rif = JSON.parse(readFileSync(process.argv[2] || join(qui, 'riferimento-python.json'), 'utf8'));
let uguali = 0;
corpus.forEach((t, i) => {
  const js = fonemizza(t);
  if (js === rif[i]) uguali++;
  else {
    console.log(`\n#${i} DIVERSO\n  testo: ${t}\n  py: ${rif[i]}\n  js: ${js}`);
    const a = rif[i].split(' ');
    const b = js.split(' ');
    for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) console.log(`    parola ${k}: py "${a[k]}" js "${b[k]}"`);
  }
});
console.log(`\nidentici ${uguali}/${corpus.length}; dati espeak ${(pacco.dati.length / 1024).toFixed(0)} KB`);
