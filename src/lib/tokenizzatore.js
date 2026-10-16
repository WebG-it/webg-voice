// Tokenizzatore di Whisper (BPE a livello di byte, come GPT-2) letto dal tokenizer.json
// del modello. Serve a due cose: trasformare in testo i token prodotti dal modello e
// trasformare in token il prompt iniziale (i termini del dizionario personale).

function byteUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n++);
    }
  }
  const enc = new Map();
  const dec = new Map();
  bs.forEach((b, i) => {
    const c = String.fromCodePoint(cs[i]);
    enc.set(b, c);
    dec.set(c, b);
  });
  return { enc, dec };
}

// pre-divisione di GPT-2
const PEZZI = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/**
 * @param {object} json il contenuto di tokenizer.json
 */
export function creaTokenizzatore(json) {
  const vocab = json.model.vocab;
  const daId = [];
  for (const [t, id] of Object.entries(vocab)) daId[id] = t;
  const speciali = new Map();
  const idSpeciali = new Set();
  for (const a of json.added_tokens || []) {
    daId[a.id] = a.content;
    speciali.set(a.content, a.id);
    if (a.special) idSpeciali.add(a.id);
  }
  const rango = new Map();
  (json.model.merges || []).forEach((m, i) => rango.set(Array.isArray(m) ? m.join(' ') : m, i));
  const { enc, dec } = byteUnicode();
  const utf8 = new TextEncoder();
  const daUtf8 = new TextDecoder('utf-8', { fatal: false });
  const memo = new Map();

  function bpe(parola) {
    if (memo.has(parola)) return memo.get(parola);
    let p = [...parola];
    while (p.length > 1) {
      let migliore = -1;
      let r = Infinity;
      for (let i = 0; i < p.length - 1; i++) {
        const k = rango.get(p[i] + ' ' + p[i + 1]);
        if (k !== undefined && k < r) {
          r = k;
          migliore = i;
        }
      }
      if (migliore < 0) break;
      const a = p[migliore];
      const b = p[migliore + 1];
      const nuovo = [];
      for (let i = 0; i < p.length; i++) {
        if (i < p.length - 1 && p[i] === a && p[i + 1] === b) {
          nuovo.push(a + b);
          i++;
        } else nuovo.push(p[i]);
      }
      p = nuovo;
    }
    if (memo.size < 5000) memo.set(parola, p);
    return p;
  }

  return {
    /** id di un token speciale, es. "<|it|>" (undefined se il modello non lo ha) */
    speciale: (s) => speciali.get(s),
    dimensione: daId.length,
    eSpeciale: (id) => idSpeciali.has(id),
    /** testo -> id (senza token speciali) */
    codifica(testo) {
      const out = [];
      for (const m of String(testo).matchAll(PEZZI)) {
        const s = [...utf8.encode(m[0])].map((b) => enc.get(b)).join('');
        for (const t of bpe(s)) {
          const id = vocab[t];
          if (id !== undefined) out.push(id);
        }
      }
      return out;
    },
    /** id -> testo, i token speciali si saltano */
    decodifica(ids) {
      const byte = [];
      for (const id of ids) {
        if (idSpeciali.has(id)) continue;
        const t = daId[id];
        if (t === undefined) continue;
        for (const c of t) {
          const b = dec.get(c);
          if (b !== undefined) byte.push(b);
        }
      }
      return daUtf8.decode(new Uint8Array(byte));
    },
  };
}
