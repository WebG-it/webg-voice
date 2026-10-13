// Pronuncia di sigle e parole inglesi: fonemi prima (solo voce italiana) e dopo
// (sigle risolte, segmenti inglesi con la voce inglese). Controlla anche che le
// frasi solo italiane del corpus restino identiche.
// Uso: node test/pronuncia.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { avviaEspeak } from '../src/lib/espeak.js';
import { creaFonemizzatore } from '../src/lib/fonemi.js';
import { normalizza } from '../src/lib/normalizza.js';
import { creaFonemizzatoreMisto, segmenta, leggiSigla } from '../src/lib/pronuncia.js';

const qui = dirname(fileURLToPath(import.meta.url));
const ve = join(qui, '..', 'vendor', 'espeak');
const clausole = await avviaEspeak({
  creaModulo: (await import('../vendor/espeak/espeak-ng.mjs')).default,
  wasm: new Uint8Array(readFileSync(join(ve, 'espeak-ng.wasm'))),
  indice: JSON.parse(readFileSync(join(ve, 'espeak-dati.json'), 'utf8')),
  dati: new Uint8Array(readFileSync(join(ve, 'espeak-dati.bin'))),
});
const fonIt = creaFonemizzatore(clausole, { rimuoviMarcatori: true });
const fonEn = creaFonemizzatore((t) => clausole(t, 'en-us'), { rimuoviMarcatori: true });
const misto = creaFonemizzatoreMisto(fonIt, fonEn);

export const FRASI = JSON.parse(readFileSync(join(qui, 'pronuncia.json'), 'utf8'));
for (const f of FRASI) {
  const n = normalizza(f);
  console.log(`\n${f}\n  segmenti: ${segmenta(n).map((s) => `[${s.lingua}] ${s.testo}`).join(' | ')}\n  prima: ${fonIt(n)}\n  dopo:  ${misto(n)}`);
}

// Corpus di parita': le frasi senza sigle ne' parole inglesi devono restare identiche
const corpus = JSON.parse(readFileSync(join(qui, 'corpus.json'), 'utf8'));
let uguali = 0;
const cambiate = [];
corpus.forEach((c, i) => {
  const n = normalizza(c);
  if (fonIt(n) === misto(n)) uguali++;
  else cambiate.push(`#${i} ${c}`);
});
console.log(`\nCorpus: ${uguali}/${corpus.length} frasi identiche; cambiate (devono contenere sigle o parole inglesi):\n  ${cambiate.join('\n  ')}`);
console.log('\nSigle:', ['RAM', 'SEO', 'NATO', 'ISTAT', 'USB', 'CPU', 'PDF', 'IVA', 'INPS', 'CEO', 'ONU', 'BCE', 'ATTENZIONE', 'XIV', 'NO', 'FBI', 'ARPA', 'TIR'].map((s) => `${s}=${leggiSigla(s).modo}:${leggiSigla(s).testo}`).join(', '));
