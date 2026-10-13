// Divide un testo in paragrafi e frasi, poi raggruppa le frasi (gia' in fonemi)
// in blocchi da sintetizzare uno alla volta: il primo corto, per partire subito,
// i successivi piu' lunghi, perche' Kokoro suona piu' naturale su frasi intere.

import { dividiFonemi, pausaDopo, MAX_FONEMI } from './fonemi.js';

// Parole dopo cui il punto non chiude la frase (se non sono gia' state sciolte)
const ABBR = new Set(['sig', 'sigg', 'dott', 'dr', 'prof', 'ing', 'avv', 'arch', 'geom', 'rag',
  'on', 'ecc', 'etc', 'art', 'pag', 'pagg', 'pp', 'n', 'nn', 'cap', 'cfr', 'es', 'vol', 'fig',
  'tel', 'sec', 'ca', 'circa', 'st', 'mr', 'mrs', 'ms', 'vs', 'p', 'c', 'v', 'lett', 'int']);

/** Paragrafi: ogni a capo e' un confine (getSelection mette \n fra i blocchi). */
export function paragrafi(testo) {
  return testo
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((p) => p.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/** Frasi di un paragrafo. */
export function frasi(par) {
  const out = [];
  // fine frase: . ! ? … (anche ripetuti), eventuali chiusure, poi spazio
  const re = /[.!?…]+["'»”’)\]]*\s+/g;
  let inizio = 0;
  let m;
  while ((m = re.exec(par))) {
    const fine = m.index + m[0].length;
    const prima = par.slice(inizio, m.index);
    const dopo = par.slice(fine);
    const parola = (prima.match(/([\p{L}]+)$/u) || [])[1] || '';
    const soloPunto = /^\.$/.test(m[0].trim());
    // abbreviazione o iniziale puntata ("G. Verdi"): non si spezza
    if (soloPunto && (ABBR.has(parola.toLowerCase()) || /^\p{Lu}$/u.test(parola))) continue;
    // dopo deve iniziare qualcosa che somiglia a una frase nuova
    if (!/^["'«“(—–-]?\s*[\p{Lu}\p{N}¿¡«“"'—–-]/u.test(dopo)) continue;
    out.push(par.slice(inizio, fine).trim());
    inizio = fine;
  }
  const resto = par.slice(inizio).trim();
  if (resto) out.push(resto);
  return out;
}

// Dimensioni in fonemi. In WASM il modello va a circa 0,8 volte il tempo reale:
// il primo blocco e' corto (si sente presto), poi ogni blocco puo' crescere di
// poco rispetto al precedente, perche' va sintetizzato mentre l'altro suona.
const PRIMO_MIN_N = 30; // una prima frase piu' corta si unisce all'inciso seguente
const PRIMO_MAX_N = 90;
const CRESCITA_N = 1.25; // un blocco al massimo 1,25 volte il precedente
const LIMITE_MIN = 60;
const BLOCCO_MAX = 300;
const PAUSA_PARAGRAFO = 0.4;
const lung = (s) => [...s].length;

/** Spezza una frase ai segni , ; : in pezzi di circa `limite` fonemi (mai a meta' inciso, salvo oltre 510). */
function perIncisi(f, limite) {
  const incisi = f.split(/(?<=[,;:—])\s+/u).flatMap((x) => (lung(x) > MAX_FONEMI ? dividiFonemi(x, MAX_FONEMI) : [x]));
  const out = [];
  for (const x of incisi) {
    const i = out.length - 1;
    if (i >= 0 && lung(out[i]) + 1 + lung(x) <= Math.max(limite, MAX_FONEMI_BLOCCO_INCISO)) out[i] += ` ${x}`;
    else out.push(x);
  }
  return out;
}
const MAX_FONEMI_BLOCCO_INCISO = 40; // incisi cortissimi si attaccano al vicino

/**
 * Costruisce i blocchi.
 * @param {string} testo
 * @param {(s: string) => string} fonemizza testo -> fonemi
 * @returns {{testo: string, fonemi: string, pausa: number}[]}
 */
export function blocchi(testo, fonemizza, opzioni = {}) {
  // Su un PC lento (sintesi vicina o sopra il tempo reale) si parte con blocchi
  // piu' corti e si cresce piu' piano: il primo suono arriva prima, e il
  // lettore tiene piu' blocchi pronti in anticipo (vedi offscreen.js).
  const lento = (opzioni.rtf || 0) > 0.85;
  const PRIMO_MIN = lento ? 20 : PRIMO_MIN_N;
  const PRIMO_MAX = lento ? 60 : PRIMO_MAX_N;
  const CRESCITA = lento ? 1.15 : CRESCITA_N;
  // frasi in fonemi, ognuna con il paragrafo di appartenenza
  const frs = [];
  for (const par of paragrafi(testo)) {
    const fr = frasi(par);
    fr.forEach((f, i) => {
      const fon = fonemizza(f);
      if (fon) frs.push({ testo: f, fonemi: fon, fineParagrafo: i === fr.length - 1 });
    });
  }
  const out = [];
  let limite = PRIMO_MAX;
  let cur = null;
  const chiudi = () => {
    if (!cur) return;
    out.push(cur);
    limite = Math.min(BLOCCO_MAX, Math.max(LIMITE_MIN, Math.round(limite * 1.1), Math.round(lung(cur.fonemi) * CRESCITA)));
    cur = null;
  };
  for (const f of frs) {
    // una frase piu' lunga del limite si spezza solo ai segni di punteggiatura
    const pezzi = lung(f.fonemi) > limite ? perIncisi(f.fonemi, limite) : [f.fonemi];
    pezzi.forEach((p, k) => {
      const ultimo = k === pezzi.length - 1;
      const testoP = k === 0 ? f.testo : '';
      if (cur && lung(cur.fonemi) + 1 + lung(p) > limite) chiudi();
      if (!cur) cur = { testo: testoP, fonemi: p, fineParagrafo: false };
      else {
        cur.testo = `${cur.testo} ${testoP}`.trim();
        cur.fonemi = `${cur.fonemi} ${p}`;
      }
      cur.fineParagrafo = ultimo && f.fineParagrafo;
      if (!ultimo || cur.fineParagrafo || (out.length === 0 && lung(cur.fonemi) >= PRIMO_MIN)) chiudi();
    });
  }
  chiudi();
  return out.map((b, i) => ({
    testo: b.testo,
    fonemi: b.fonemi,
    pausa: i === out.length - 1 ? 0 : pausaDopo(b.fonemi) + (b.fineParagrafo ? PAUSA_PARAGRAFO - 0.25 : 0),
  }));
}
