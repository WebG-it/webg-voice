// Fonemizzazione italiana identica a kokoro-onnx 0.6.1 + phonemizer (Python).
//
// Catena in Python:  Kokoro.tokenizer.phonemize(testo, "it")
//   -> phonemizer.phonemize(testo, "it", preserve_punctuation=True, with_stress=True)
//      -> Punctuation.preserve (spezza sulla punteggiatura, decimali esclusi)
//      -> per ogni pezzo espeak_TextToPhonemes in ciclo (modo IPA, separatore "_"),
//         clausole unite da " "
//      -> _postprocess_line (toglie i "_", parole separate da " ")
//      -> Punctuation.restore (rimette la punteggiatura)
//   -> filtro sul vocabolario Kokoro, strip
//   -> " ".join(fonemi.split())  (in Kokoro._prepare)
//
// Qui la stessa cosa in JavaScript. La funzione espeak (testo -> clausole IPA)
// arriva da fuori, cosi' il modulo gira sia nel browser sia in Node per i test.

import { VOCAB } from './vocab.js';

// phonemizer/punctuation.py: _DEFAULT_MARKS e _DECIMAL_SEPARATORS
const SEGNI = ';:,.!?¡¿—…"«»“”(){}[]';
const DECIMALI = ',.';

function escapeClasse(s) {
  return s.replace(/[\\\]\[^-]/g, (c) => '\\' + c);
}

// Stessa regex di Punctuation.marks (setter, caso stringa):
// (\s*(?:[altri]|(?<![0-9])[,.]|[,.](?![0-9]))+\s*)+
const altri = [...SEGNI].filter((c) => !DECIMALI.includes(c)).join('');
const RE_SEGNI = new RegExp(
  `(\\s*(?:[${escapeClasse(altri)}]|(?<![0-9])[${escapeClasse(DECIMALI)}]|[${escapeClasse(DECIMALI)}](?![0-9]))+\\s*)+`,
  'gu'
);

// Punctuation._preserve_line: una riga -> pezzi di testo + segni con posizione
function preservaRiga(riga, num) {
  const trovati = [...riga.matchAll(RE_SEGNI)].map((m) => m[0]);
  if (trovati.length === 0) return { pezzi: [riga], segni: [] };
  if (trovati.length === 1 && trovati[0] === riga) {
    return { pezzi: [], segni: [{ index: num, mark: riga, position: 'A' }] };
  }
  const segni = [];
  trovati.forEach((g, i) => {
    let position = 'I';
    if (i === 0 && riga.startsWith(g)) position = 'B';
    else if (i === trovati.length - 1 && riga.endsWith(g)) position = 'E';
    segni.push({ index: num, mark: g, position });
  });
  const pezzi = [];
  let resto = riga;
  for (const s of segni) {
    const k = resto.indexOf(s.mark);
    // Python: split(mark)[0] e il resto riunito, equivale a tagliare alla prima occorrenza
    if (k < 0) {
      pezzi.push(resto);
      resto = '';
    } else {
      pezzi.push(resto.slice(0, k));
      resto = resto.slice(k + s.mark.length);
    }
  }
  pezzi.push(resto);
  return { pezzi, segni };
}

// Punctuation.restore con Separator(phone='', word=' ') e strip=False
function ripristina(testi, segni) {
  const sep = ' ';
  let text = [...testi];
  let marks = [...segni];
  const out = [];
  let pos = 0;
  while (text.length || marks.length) {
    if (!marks.length) {
      for (let line of text) {
        if (!line.endsWith(sep)) line += sep;
        out.push(line);
      }
      text = [];
    } else if (!text.length) {
      out.push(marks.map((m) => m.mark).join('').replace(/ /g, sep));
      marks = [];
    } else {
      const cur = marks[0];
      if (cur.index === pos) {
        marks = marks.slice(1);
        const mark = cur.mark.replace(/ /g, sep);
        if (text[0].endsWith(sep)) text[0] = text[0].slice(0, -sep.length);
        if (cur.position === 'B') {
          text[0] = mark + text[0];
        } else if (cur.position === 'E') {
          out.push(text[0] + mark + (mark.endsWith(sep) ? '' : sep));
          text = text.slice(1);
          pos += 1;
        } else if (cur.position === 'A') {
          out.push(mark + (mark.endsWith(sep) ? '' : sep));
          pos += 1;
        } else if (text.length === 1) {
          text[0] = text[0] + mark;
        } else {
          const primo = text[0];
          text = text.slice(1);
          text[0] = primo + mark + text[0];
        }
      } else {
        out.push(text[0]);
        text = text.slice(1);
        pos += 1;
      }
    }
  }
  return out;
}

// EspeakBackend._postprocess_line con with_stress=True, tie=False, strip=False.
// Con rimuoviMarcatori si applica la politica "remove-flags" di phonemizer
// (toglie "(en)" e "(it)"), invece di "keep-flags" che kokoro-onnx usa di serie.
function postprocessaRiga(riga, rimuoviMarcatori) {
  let line = riga.trim().replace(/\n/g, ' ').replace(/ {2}/g, ' ');
  line = line.replace(/_+/g, '_').replace(/_ /g, ' ');
  if (rimuoviMarcatori) line = line.replace(/\(.+?\)/g, '');
  if (!line) return '';
  let out = '';
  for (let w of line.split(' ')) {
    w = w.trim() + '_';
    w = w.replace(/_/g, '');
    out += w + ' ';
  }
  return out;
}

// Python str.strip() / str.split() senza argomenti: spazi Unicode
const RE_SPAZI_BORDI = /^\s+|\s+$/gu;
function pyStrip(s) {
  return s.replace(RE_SPAZI_BORDI, '');
}

/**
 * Crea la funzione di fonemizzazione.
 * @param {(testo: string) => string[]} clausole espeak: testo -> elenco di
 *   stringhe IPA (una per clausola, come il ciclo di text_to_phonemes)
 * @param {{rimuoviMarcatori?: boolean}} [opz] false = identico a kokoro-onnx,
 *   che lascia nei fonemi i marcatori di lingua "(en)...(it)" e il modello li
 *   pronuncia; true = li toglie (scelta di default dell'estensione)
 */
export function creaFonemizzatore(clausole, opz = {}) {
  const rimuovi = !!opz.rimuoviMarcatori;
  // phonemizer.phonemize(...) su una stringa
  function phonemize(testo) {
    // _phonemize: str2list divide sulle righe; nel browser usiamo "\n"
    // (Python su Windows usa os.linesep, qui il testo arriva gia' a blocchi)
    let righe = testo.replace(/^[\r\n]+|[\r\n]+$/g, '').split('\n');
    righe = righe.map((r) => r.replace(/^[\r\n]+|[\r\n]+$/g, '')).filter((r) => pyStrip(r));
    if (!righe.length) return '';
    // preserve
    let pezzi = [];
    let segni = [];
    righe.forEach((r, num) => {
      const p = preservaRiga(r, num);
      pezzi = pezzi.concat(p.pezzi);
      segni = segni.concat(p.segni);
    });
    pezzi = pezzi.filter((x) => x);
    // espeak su ogni pezzo
    const fon = pezzi.map((p) => postprocessaRiga(clausole(p).filter((c) => c).join(' '), rimuovi));
    const righeOut = ripristina(fon, segni);
    return righeOut.join('\n');
  }

  // Tokenizer.phonemize + la pulizia di Kokoro._prepare
  return function fonemizza(testo) {
    const grezzo = phonemize(pyStrip(testo));
    const filtrato = [...grezzo].filter((c) => c in VOCAB).join('');
    return pyStrip(filtrato).split(/\s+/u).filter(Boolean).join(' ');
  };
}

/** Fonemi -> id del vocabolario (Tokenizer.tokenize), scartando quelli ignoti. */
export function tokenizza(fonemi) {
  const ids = [];
  for (const c of fonemi) {
    const id = VOCAB[c];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

// ---- Suddivisione in lotti (kokoro_onnx/chunker.py) ----
export const MAX_FONEMI = 510;
const SEGNI_FRASE = '.!?…';
const SEGNI_INCISO = ',;:';
const CONFINI = [
  new RegExp(`(?<=[${escapeClasse(SEGNI_FRASE)}])\\s+`, 'u'),
  new RegExp(`(?<=[${escapeClasse(SEGNI_INCISO)}])\\s+`, 'u'),
  /\s+/u,
];

function* atomi(f, max, livello = 0) {
  // len() di Python conta i code point: qui usiamo l'array di caratteri
  if ([...f].length <= max) {
    if (f) yield f;
    return;
  }
  for (let i = livello; i < CONFINI.length; i++) {
    const pezzi = f.split(CONFINI[i]);
    if (pezzi.length > 1) {
      for (const p of pezzi) yield* atomi(pyStrip(p), max, i + 1);
      return;
    }
  }
  const cs = [...f];
  for (let s = 0; s < cs.length; s += max) yield cs.slice(s, s + max).join('');
}

function impacchetta(lunghezze, limite) {
  const lotti = [];
  let inizio = 0;
  let dim = 0;
  lunghezze.forEach((l, i) => {
    const cand = i === inizio ? l : dim + 1 + l;
    if (cand > limite && i > inizio) {
      lotti.push([inizio, i]);
      inizio = i;
      dim = l;
    } else {
      dim = cand;
    }
  });
  if (lunghezze.length) lotti.push([inizio, lunghezze.length]);
  return lotti;
}

/** split_phonemes: lotti bilanciati di al massimo `max` fonemi. */
export function dividiFonemi(f, max = MAX_FONEMI) {
  const at = [...atomi(pyStrip(f), max)];
  if (!at.length) return [];
  const lung = at.map((a) => [...a].length);
  const minimo = impacchetta(lung, max).length;
  let lo = Math.max(...lung);
  let hi = max;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (impacchetta(lung, mid).length <= minimo) hi = mid;
    else lo = mid + 1;
  }
  return impacchetta(lung, lo).map(([a, b]) => at.slice(a, b).join(' '));
}

/** pause_after: secondi di silenzio dopo un lotto che finisce cosi'. */
export function pausaDopo(f, frase = 0.25, inciso = 0.1) {
  const t = f.replace(/\s+$/u, '');
  const ultimo = [...t].pop() || '';
  if (SEGNI_FRASE.includes(ultimo)) return frase;
  if (SEGNI_INCISO.includes(ultimo)) return inciso;
  return 0;
}
