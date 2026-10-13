// Prepara il pacchetto dati di espeak-ng ridotto all'italiano (piu' l'inglese,
// che espeak usa per le parole straniere che riconosce, es. "Google").
// Sorgente: la cartella espeak-ng-data di espeakng_loader 0.2.4 (espeak 1.52.0),
// cioe' gli stessi dati che usa kokoro-onnx in Python.
// Uso: node scripts/dati-espeak.mjs <cartella espeak-ng-data>
//   -> scrive vendor/espeak/espeak-dati.bin e espeak-dati.json
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NECESSARI = ['phontab', 'phondata', 'phonindex', 'intonations', 'it_dict', 'en_dict'];
const VOCI = (rel) => rel.startsWith('lang/');

function impacchetta(voci) {
  let offset = 0;
  const file = {};
  const parti = [];
  for (const [nome, byte] of voci) {
    file[nome] = { offset, length: byte.length };
    parti.push(byte);
    offset += byte.length;
  }
  const dati = new Uint8Array(offset);
  let o = 0;
  for (const p of parti) {
    dati.set(p, o);
    o += p.length;
  }
  return { indice: { file }, dati };
}

/** Da una cartella espeak-ng-data completa (es. quella di espeakng_loader). */
export function daCartella(dir) {
  const voci = [];
  const giro = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) giro(p);
      else {
        const rel = relative(dir, p).replace(/\\/g, '/');
        if (NECESSARI.includes(rel) || VOCI(rel)) voci.push([rel, new Uint8Array(readFileSync(p))]);
      }
    }
  };
  giro(dir);
  return impacchetta(voci);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2]) {
  const { indice, dati } = daCartella(process.argv[2]);
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'espeak');
  writeFileSync(join(out, 'espeak-dati.bin'), dati);
  writeFileSync(join(out, 'espeak-dati.json'), JSON.stringify(indice));
  console.log(`scritti ${Object.keys(indice.file).length} file, ${dati.length} byte`);
}
