// Prova senza browser di src/lib/esporta.js: Markdown della trascrizione -> TXT, SRT, DOCX.
//   node test/call/esporta.mjs [cartella dove scrivere i file di esempio]
// Con una cartella scrive anche esempio.docx, da aprire con Word o da controllare con python-docx.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { creaTrascrizione, markdown } from '../../src/lib/chiamata-testo.js';
import { leggiMarkdown, comeTesto, comeSrt, comeDocx, oraSrt, msDaOra, crc32, esporta, zip } from '../../src/lib/esporta.js';

let ok = 0;
let ko = 0;
const controlla = (nome, cond, dettaglio = '') => {
  if (cond) ok++;
  else {
    ko++;
    console.log('KO ', nome, dettaglio);
  }
};
const uguali = (nome, a, b) => controlla(nome, a === b, `atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`);

const t = creaTrascrizione();
t.aggiungi({ fonte: 'Call', inizio: 1000, fine: 3000, testo: 'Buongiorno a tutti, iniziamo.' });
t.aggiungi({ fonte: 'Io', inizio: 8000, fine: 9500, testo: 'Buongiorno. Ho il preventivo "Rossi & figli" <bozza>.' });
t.lacuna(20000, 30000);
t.aggiungi({ fonte: 'Call', inizio: 3725000, fine: 3730000, testo: 'Ultimo punto dopo un\'ora.' });
const md = markdown({ trascrizione: t, titolo: 'Riunione: sito *nuovo*', host: 'meet.google.com', inizio: new Date(2026, 10, 4, 10, 0), fine: new Date(2026, 10, 4, 11, 3), versione: '1.7.0' });

// ore
uguali('msDaOra mm:ss', msDaOra('01:23'), 83000);
uguali('msDaOra h:mm:ss', msDaOra('1:02:05'), 3725000);
uguali('oraSrt', oraSrt(3725123), '01:02:05,123');
uguali('oraSrt zero', oraSrt(-4), '00:00:00,000');

// lettura del Markdown
const d = leggiMarkdown(md);
uguali('titolo', d.titolo, 'Riunione: sito *nuovo*');
uguali('battute + lacuna', d.righe.length, 4);
uguali('prima fonte', d.righe[0].fonte, 'Call');
uguali('seconda battuta', d.righe[1].testo, 'Buongiorno. Ho il preventivo "Rossi & figli" <bozza>.');
uguali('lacuna senza fonte', d.righe[2].fonte, null);
uguali('ora oltre un\'ora', d.righe[3].ms, 3725000);
controlla('intestazione con la data', d.intestazione.some((r) => r.startsWith('Data: 4 novembre 2026')));

// TXT
const txt = comeTesto(md);
controlla('txt: niente asterischi', !/\*\*/.test(txt), txt);
controlla('txt: battuta con orario', txt.includes('[00:08] Io: Buongiorno. Ho il preventivo'));
controlla('txt: tratto saltato tra parentesi', /\[00:20\] \(Tratto non trascritto/.test(txt));
controlla('txt: fine riga Windows', txt.includes('\r\n') && !/[^\r]\n/.test(txt));

// SRT
const srt = comeSrt(md);
const blocchi = srt.trim().split(/\r\n\r\n/);
uguali('srt: tre sottotitoli (la lacuna no)', blocchi.length, 3);
uguali('srt: primo tempo', blocchi[0].split('\r\n')[1], '00:00:01,000 --> 00:00:02,600');
controlla('srt: fine prima della battuta dopo', blocchi[1].split('\r\n')[1].startsWith('00:00:08,000 --> 00:00:'));
uguali('srt: numerazione', blocchi.map((b) => b.split('\r\n')[0]).join(','), '1,2,3');
uguali('srt: testo con la fonte', blocchi[2].split('\r\n')[2], "Call: Ultimo punto dopo un'ora.");

// zip e DOCX: si rilegge lo zip a mano e si controlla CRC e contenuto
uguali('crc32 noto', crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
function leggiZip(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fine = b.byteLength - 22;
  controlla('zip: fine della directory', v.getUint32(fine, true) === 0x06054b50);
  const n = v.getUint16(fine + 10, true);
  let p = v.getUint32(fine + 16, true);
  const out = {};
  for (let i = 0; i < n; i++) {
    controlla('zip: voce centrale', v.getUint32(p, true) === 0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const dim = v.getUint32(p + 20, true);
    const ln = v.getUint16(p + 28, true);
    const off = v.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + ln));
    const lnLoc = v.getUint16(off + 26, true);
    const dati = b.subarray(off + 30 + lnLoc, off + 30 + lnLoc + dim);
    controlla(`zip: crc di ${nome}`, crc32(dati) === crc);
    out[nome] = new TextDecoder().decode(dati);
    p += 46 + ln;
  }
  return out;
}
const docx = comeDocx(md);
const f = leggiZip(docx);
uguali('docx: tre parti', Object.keys(f).sort().join(','), '[Content_Types].xml,_rels/.rels,word/document.xml');
controlla('docx: testo con caratteri speciali in XML', f['word/document.xml'].includes('&quot;Rossi &amp; figli&quot; &lt;bozza&gt;'));
controlla('docx: orario in grassetto', f['word/document.xml'].includes('<w:b/></w:rPr><w:t xml:space="preserve">[00:08] Io: </w:t>'));
controlla('docx: XML ben formato (nessun & nudo)', !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(f['word/document.xml']));
void inflateRawSync;
const vuoto = zip([]);
uguali('zip vuoto: 22 byte', vuoto.length, 22);

// nomi dei file
uguali('nome txt', esporta(md, 'txt', 'Riunione 2026-11-04 10-00.md').nome, 'Riunione 2026-11-04 10-00.txt');
uguali('nome docx', esporta(md, 'docx', 'Riunione.md').nome, 'Riunione.docx');
uguali('md invariato', esporta(md, 'md', 'R.md').dati, md);
let errore = false;
try {
  esporta(md, 'exe', 'R.md');
} catch {
  errore = true;
}
controlla('formato sconosciuto rifiutato', errore);

// trascrizione vuota
const vuota = markdown({ trascrizione: creaTrascrizione(), titolo: '', host: '', inizio: new Date(), fine: new Date(), versione: '1.7.0' });
uguali('vuota: srt vuoto', comeSrt(vuota), '');
controlla('vuota: txt con la nota', comeTesto(vuota).includes('Nessun parlato riconosciuto'));

if (process.argv[2]) {
  mkdirSync(process.argv[2], { recursive: true });
  writeFileSync(join(process.argv[2], 'esempio.docx'), docx);
  writeFileSync(join(process.argv[2], 'esempio.srt'), srt);
  writeFileSync(join(process.argv[2], 'esempio.txt'), txt);
}

console.log(`${ok} su ${ok + ko}${ko ? `, ${ko} KO` : ' tutto OK'}`);
process.exit(ko ? 1 : 0);
