// Parti dell'MP3 che non dipendono dal codificatore: nome del file e tag ID3.
// La codifica vera (lamejs, LGPL-3.0) gira in mp3-worker.js.

export const KBPS = 64; // mono a 24 kHz: voce pulita, circa 0,5 MB al minuto
export const MAX_NOME = 80;

/**
 * Nome del file: il titolo dell'articolo o l'inizio del testo, senza caratteri
 * che Windows, macOS o Linux non accettano, al massimo 80 caratteri, con ".mp3".
 */
export function nomeFile(titolo, testo) {
  let base = String(titolo || '').trim();
  if (!base) {
    const parole = String(testo || '').replace(/\s+/g, ' ').trim().split(' ');
    base = '';
    for (const p of parole) {
      if ((base + ' ' + p).trim().length > 60) break;
      base = (base + ' ' + p).trim();
    }
    if (!base) base = String(testo || '').trim().slice(0, 60);
  }
  base = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[\s.,;:!?'’-]+$/g, '');
  if ([...base].length > MAX_NOME) {
    const tagliato = [...base].slice(0, MAX_NOME).join('');
    const spazio = tagliato.lastIndexOf(' ');
    base = (spazio > MAX_NOME / 2 ? tagliato.slice(0, spazio) : tagliato).replace(/[\s.,;:!-]+$/, '');
  }
  // nomi riservati di Windows
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = 'WebG Voice';
  return `${base}.mp3`;
}

/** Tag ID3v2.3 con titolo, artista e album (testi in UTF-16 con BOM). */
export function tagId3({ titolo = '', artista = '', album = '' } = {}) {
  const frame = (id, testo) => {
    const t = String(testo || '').slice(0, 500);
    if (!t) return null;
    const dati = new Uint8Array(3 + t.length * 2);
    dati[0] = 1; // UTF-16 con BOM
    dati[1] = 0xff;
    dati[2] = 0xfe;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      dati[3 + i * 2] = c & 0xff;
      dati[4 + i * 2] = c >> 8;
    }
    const h = new Uint8Array(10);
    h.set([...id].map((c) => c.charCodeAt(0)), 0);
    new DataView(h.buffer).setUint32(4, dati.length);
    return [h, dati];
  };
  const parti = [frame('TIT2', titolo), frame('TPE1', artista), frame('TALB', album)].filter(Boolean).flat();
  const corpo = parti.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(10 + corpo);
  out.set([0x49, 0x44, 0x33, 3, 0, 0], 0); // "ID3", versione 2.3, nessun flag
  // dimensione "syncsafe": 7 bit per byte
  out[6] = (corpo >> 21) & 0x7f;
  out[7] = (corpo >> 14) & 0x7f;
  out[8] = (corpo >> 7) & 0x7f;
  out[9] = corpo & 0x7f;
  let o = 10;
  for (const p of parti) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
