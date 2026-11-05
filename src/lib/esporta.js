// Esporta una trascrizione delle call in altri formati, partendo dal file Markdown che WebG Voice
// salva (lib/chiamata-testo.js): testo semplice (TXT), sottotitoli (SRT), Word (DOCX semplice) e lo
// stesso Markdown. Tutto sul computer, senza librerie: il DOCX e' uno zip "stored" scritto qui.
// Nessun accesso a Chrome: si prova con test/call/esporta.mjs.

const RIGA = /^\*\*\[(\d+(?::\d{2}){1,2})\] ([^:*]+):\*\* ?(.*)$/;
const LACUNA = /^_\[(\d+(?::\d{2}){1,2})\] (.*)_$/;

/** "01:23" -> 83000, "1:02:03" -> 3723000 */
export function msDaOra(t) {
  const p = String(t).split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return 0;
  return p.reduce((s, n) => s * 60 + n, 0) * 1000;
}

/** Dal Markdown: titolo, righe di intestazione e battute { ms, fonte, testo } (fonte null = tratto saltato). */
export function leggiMarkdown(md) {
  const out = { titolo: 'Call', intestazione: [], righe: [] };
  for (const r of String(md || '').split(/\r?\n/)) {
    const l = r.trim();
    if (!l) continue;
    let m;
    if (l.startsWith('# ') && out.titolo === 'Call' && !out.righe.length) out.titolo = l.slice(2).trim() || 'Call';
    else if (l.startsWith('- ') && !out.righe.length) out.intestazione.push(l.slice(2).trim());
    else if ((m = RIGA.exec(l))) out.righe.push({ ms: msDaOra(m[1]), ora: m[1], fonte: m[2].trim(), testo: m[3].trim() });
    else if ((m = LACUNA.exec(l))) out.righe.push({ ms: msDaOra(m[1]), ora: m[1], fonte: null, testo: m[2].trim() });
    else if (/^_.*_$/.test(l)) out.intestazione.push(l.replace(/^_|_$/g, ''));
  }
  return out;
}

/** Testo semplice: niente segni del Markdown. */
export function comeTesto(md) {
  const d = leggiMarkdown(md);
  const out = [d.titolo, ''];
  for (const i of d.intestazione) out.push(i);
  out.push('');
  for (const r of d.righe) out.push(r.fonte ? `[${r.ora}] ${r.fonte}: ${r.testo}` : `[${r.ora}] (${r.testo})`);
  return out.join('\r\n').replace(/(\r\n){3,}/g, '\r\n\r\n').trimEnd() + '\r\n';
}

const due = (n, k = 2) => String(n).padStart(k, '0');
/** 83000 -> "00:01:23,000" */
export function oraSrt(ms) {
  const v = Math.max(0, Math.round(ms));
  const h = Math.floor(v / 3600000);
  const m = Math.floor((v % 3600000) / 60000);
  const s = Math.floor((v % 60000) / 1000);
  return `${due(h)}:${due(m)}:${due(s)},${due(v % 1000, 3)}`;
}

/**
 * Sottotitoli SRT. Il Markdown ha solo l'ora d'inizio di ogni battuta: la fine e' l'inizio della
 * successiva, ma non oltre il tempo di lettura stimato (circa 0,4 secondi a parola, minimo 1,5 s).
 */
export function comeSrt(md) {
  const righe = leggiMarkdown(md).righe.filter((r) => r.fonte);
  const out = [];
  righe.forEach((r, i) => {
    const parole = r.testo.split(/\s+/).filter(Boolean).length;
    const stimata = r.ms + Math.max(1500, parole * 400);
    const prossima = i + 1 < righe.length ? righe[i + 1].ms : Infinity;
    const fine = Math.max(r.ms + 500, Math.min(stimata, prossima > r.ms ? prossima : stimata));
    out.push(String(i + 1), `${oraSrt(r.ms)} --> ${oraSrt(fine)}`, `${r.fonte}: ${r.testo}`, '');
  });
  return out.join('\r\n');
}

// ---- DOCX: tre file XML in uno zip senza compressione ----
const xml = (t) =>
  String(t)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const run = (t, { grassetto = false, corsivo = false, dim = 0, colore = '' } = {}) => {
  const pr = [grassetto ? '<w:b/>' : '', corsivo ? '<w:i/>' : '', colore ? `<w:color w:val="${colore}"/>` : '', dim ? `<w:sz w:val="${dim}"/>` : ''].join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
};
const par = (...runs) => `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs.join('')}</w:p>`;

function documentoXml(md) {
  const d = leggiMarkdown(md);
  const corpo = [par(run(d.titolo, { grassetto: true, dim: 36 }))];
  for (const i of d.intestazione) corpo.push(par(run(i, { colore: '555555', dim: 20 })));
  corpo.push(par(''));
  for (const r of d.righe) {
    if (!r.fonte) corpo.push(par(run(`[${r.ora}] ${r.testo}`, { corsivo: true, colore: '777777' })));
    else corpo.push(par(run(`[${r.ora}] ${r.fonte}: `, { grassetto: true }), run(r.testo)));
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    corpo.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>'
  );
}

const TIPI =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';
const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';

let tabellaCrc = null;
export function crc32(byte) {
  if (!tabellaCrc) {
    tabellaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabellaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < byte.length; i++) c = tabellaCrc[(c ^ byte[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip senza compressione (metodo 0): [{ nome, dati: Uint8Array }] -> Uint8Array */
export function zip(file) {
  const enc = new TextEncoder();
  const locali = [];
  const centrali = [];
  let offset = 0;
  for (const f of file) {
    const nome = enc.encode(f.nome);
    const crc = crc32(f.dati);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // nomi in UTF-8
    l.setUint16(8, 0, true);
    l.setUint16(10, 0, true);
    l.setUint16(12, 0x21, true); // 1-1-1980
    l.setUint32(14, crc, true);
    l.setUint32(18, f.dati.length, true);
    l.setUint32(22, f.dati.length, true);
    l.setUint16(26, nome.length, true);
    l.setUint16(28, 0, true);
    locali.push(new Uint8Array(l.buffer), nome, f.dati);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.dati.length, true);
    c.setUint32(24, f.dati.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, offset, true);
    centrali.push(new Uint8Array(c.buffer), nome);
    offset += 30 + nome.length + f.dati.length;
  }
  const dimCentrale = centrali.reduce((s, b) => s + b.length, 0);
  const fine = new DataView(new ArrayBuffer(22));
  fine.setUint32(0, 0x06054b50, true);
  fine.setUint16(8, file.length, true);
  fine.setUint16(10, file.length, true);
  fine.setUint32(12, dimCentrale, true);
  fine.setUint32(16, offset, true);
  const parti = [...locali, ...centrali, new Uint8Array(fine.buffer)];
  const out = new Uint8Array(parti.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of parti) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

/** Documento Word (.docx) semplice: titolo, intestazione e una riga per battuta. */
export function comeDocx(md) {
  const enc = new TextEncoder();
  return zip([
    { nome: '[Content_Types].xml', dati: enc.encode(TIPI) },
    { nome: '_rels/.rels', dati: enc.encode(RELS) },
    { nome: 'word/document.xml', dati: enc.encode(documentoXml(md)) },
  ]);
}

export const FORMATI = {
  md: { estensione: 'md', tipo: 'text/markdown;charset=utf-8', nome: 'Markdown' },
  txt: { estensione: 'txt', tipo: 'text/plain;charset=utf-8', nome: 'Testo' },
  srt: { estensione: 'srt', tipo: 'application/x-subrip;charset=utf-8', nome: 'Sottotitoli' },
  docx: { estensione: 'docx', tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nome: 'Word' },
};

/** Contenuto e nome del file nel formato chiesto. */
export function esporta(md, formato, nomeMd) {
  const f = FORMATI[formato];
  if (!f) throw new Error(`formato sconosciuto: ${formato}`);
  const nome = String(nomeMd || 'Call.md').replace(/\.md$/i, '') + '.' + f.estensione;
  const dati = formato === 'md' ? md : formato === 'txt' ? comeTesto(md) : formato === 'srt' ? comeSrt(md) : comeDocx(md);
  return { nome, tipo: f.tipo, dati };
}
