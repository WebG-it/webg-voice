// Crea uno zip (deflate) di una cartella, con percorsi separati da "/" come
// vuole il Chrome Web Store. Nessuna dipendenza: solo zlib di Node.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

function elenco(dir) {
  const out = [];
  const giro = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) giro(p);
      else out.push(p);
    }
  };
  giro(dir);
  return out;
}

// data e ora fisse: lo stesso contenuto da' sempre lo stesso zip
const DOS_ORA = 0;
const DOS_DATA = ((2024 - 1980) << 9) | (1 << 5) | 1;

export function zippa(cartella, destinazione) {
  const locali = [];
  const centrali = [];
  let offset = 0;
  for (const p of elenco(cartella)) {
    const nome = Buffer.from(relative(cartella, p).split('\\').join('/'), 'utf8');
    const dati = readFileSync(p);
    const compresso = deflateRawSync(dati, { level: 9 });
    const usaDeflate = compresso.length < dati.length;
    const corpo = usaDeflate ? compresso : dati;
    const crc = crc32(dati);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // nomi in UTF-8
    h.writeUInt16LE(usaDeflate ? 8 : 0, 8);
    h.writeUInt16LE(DOS_ORA, 10);
    h.writeUInt16LE(DOS_DATA, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(corpo.length, 18);
    h.writeUInt32LE(dati.length, 22);
    h.writeUInt16LE(nome.length, 26);
    h.writeUInt16LE(0, 28);
    locali.push(h, nome, corpo);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(usaDeflate ? 8 : 0, 10);
    c.writeUInt16LE(DOS_ORA, 12);
    c.writeUInt16LE(DOS_DATA, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(corpo.length, 20);
    c.writeUInt32LE(dati.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(offset, 42);
    centrali.push(c, nome);
    offset += h.length + nome.length + corpo.length;
  }
  const dimCentrale = centrali.reduce((s, b) => s + b.length, 0);
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0);
  const n = centrali.length / 2;
  fine.writeUInt16LE(n, 8);
  fine.writeUInt16LE(n, 10);
  fine.writeUInt32LE(dimCentrale, 12);
  fine.writeUInt32LE(offset, 16);
  writeFileSync(destinazione, Buffer.concat([...locali, ...centrali, fine]));
  return n;
}
