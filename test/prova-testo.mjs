// Mostra cosa diventa il testo: normalizzazione, fonemi, blocchi.
// Uso: node test/prova-testo.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { avviaEspeak } from '../src/lib/espeak.js';
import { creaFonemizzatore } from '../src/lib/fonemi.js';
import { normalizza } from '../src/lib/normalizza.js';
import { blocchi, frasi } from '../src/lib/testo.js';

const qui = dirname(fileURLToPath(import.meta.url));
const ve = join(qui, '..', 'vendor', 'espeak');
const clausole = await avviaEspeak({
  creaModulo: (await import('../vendor/espeak/espeak-ng.mjs')).default,
  wasm: new Uint8Array(readFileSync(join(ve, 'espeak-ng.wasm'))),
  indice: JSON.parse(readFileSync(join(ve, 'espeak-dati.json'), 'utf8')),
  dati: new Uint8Array(readFileSync(join(ve, 'espeak-dati.bin'))),
});
const fon = creaFonemizzatore(clausole, { rimuoviMarcatori: true });
const fonFedele = creaFonemizzatore(clausole);

const casi = [
  'La riunione è fissata per il 17/10/2026 alle ore 14:30.',
  'Nel 2025 abbiamo fatto 1.200 visite al giorno, cioè 36.000 al mese.',
  'Contro i 2.500.000 previsti, ne abbiamo spesi 3.200.000 euro.',
  'Il Dott. Rossi, la Sig.ra Bianchi e l\'Ing. Verdi sono arrivati alle 9.',
  'Il 1° gennaio, il 2° posto, la 3ª edizione.',
  'Temperatura: -3,5 °C. Vento a 20 km/h. Pesa 72 kg ed è alto 1,75 m.',
  'Visita https://www.esempio.it/servizi/seo oppure http://example.com.',
  'Ore 8.30: colazione. Ore 13.00: pranzo. Sono le 07:05.',
  'Art. 5, comma 2 del D.Lgs. 196/2003; vedi pp. 45-47, ecc.',
  'Il file pesa 2,4 GB, la RAM è da 16 GB e il ping è 120 ms. Servizio attivo 24h.',
  'Il prezzo è €14,99 oppure 14,99 € o 14,99 euro; lo sconto è del 25%.',
  'Secondo Google Search Console il sito va bene.',
];
for (const c of casi) {
  const n = normalizza(c);
  console.log(`\n${c}\n  norm: ${n}\n  fon:  ${fon(n)}`);
  if (n !== c) console.log(`  prima: ${fonFedele(c)}`);
}

const lungo = readFileSync(join(qui, 'testo-lungo.txt'), 'utf8');
console.log('\nFrasi del primo paragrafo:', frasi(lungo.split('\n')[0]));
const bl = blocchi(normalizza(lungo), fon);
bl.forEach((b, i) => console.log(`blocco ${i}: ${[...b.fonemi].length} fonemi, pausa ${b.pausa.toFixed(2)} | ${b.testo.slice(0, 70)}`));
