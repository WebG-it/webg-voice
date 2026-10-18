// Ritaglia un wav (16 kHz mono) con lo stesso segmentatore dell'estensione, come se fosse una call:
// scrive un wav per segmento e indice.json (orari). Serve a provare il motore sui segmenti veri.
//   node test/call/segmenta.mjs <call.wav> <cartella di uscita>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { creaSegmentatore, BLOCCO } from '../../src/lib/vad.js';

const [entrata, uscita] = process.argv.slice(2);
const b = readFileSync(entrata);
let off = 12;
while (b.toString('latin1', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
const n = Math.floor(Math.min(b.readUInt32LE(off + 4), b.length - off - 8) / 2);
const audio = new Float32Array(n);
for (let i = 0; i < n; i++) audio[i] = b.readInt16LE(off + 8 + 2 * i) / 32768;

function wav(y) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + y.length * 2, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(y.length * 2, 40);
  const d = Buffer.alloc(y.length * 2);
  for (let i = 0; i < y.length; i++) d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y[i] * 32767))), i * 2);
  return Buffer.concat([h, d]);
}

mkdirSync(uscita, { recursive: true });
let tempo = 0;
const indice = [];
const seg = creaSegmentatore({
  fine(a, info) {
    const fine = tempo - info.silenzioMs;
    const inizio = Math.max(0, fine - Math.max(0, info.durata * 1000 - 200));
    const id = String(indice.length + 1).padStart(3, '0');
    writeFileSync(join(uscita, `${id}.wav`), wav(a));
    indice.push({ id, inizio: Math.round(inizio), fine: Math.round(fine), durata: +info.durata.toFixed(2) });
  },
});
for (let i = 0; i + BLOCCO <= n; i += BLOCCO) {
  tempo += 20;
  seg.aggiungi(audio.subarray(i, i + BLOCCO));
}
seg.termina();
writeFileSync(join(uscita, 'indice.json'), JSON.stringify(indice, null, 1));
console.log(indice.length, 'segmenti,', indice.reduce((s, x) => s + x.durata, 0).toFixed(0), 's di parlato su', (n / 16000).toFixed(0), 's');
