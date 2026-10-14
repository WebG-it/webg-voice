// Divide un testo in paragrafi e frasi, poi raggruppa le frasi (gia' in fonemi)
// in blocchi da sintetizzare uno alla volta: il primo corto, per partire subito,
// i successivi piu' lunghi, perche' Kokoro suona piu' naturale su frasi intere.

import { dividiFonemi, pausaDopo, MAX_FONEMI } from './fonemi.js';

// Parole dopo cui il punto non chiude la frase (se non sono gia' state sciolte)
const ABBR = new Set(['sig', 'sigg', 'dott', 'dr', 'prof', 'ing', 'avv', 'arch', 'geom', 'rag',
  'on', 'ecc', 'etc', 'art', 'pag', 'pagg', 'pp', 'n', 'nn', 'cap', 'cfr', 'es', 'vol', 'fig',
  'tel', 'sec', 'ca', 'circa', 'st', 'mr', 'mrs', 'ms', 'vs', 'p', 'c', 'v', 'lett', 'int']);

// Fine di riga che chiude davvero un periodo (o un titolo, se la riga dopo e' maiuscola)
const FINE_PERIODO = /[.!?…:;]["'»”’)\]]*$/u;

/**
 * Paragrafi. Un a capo e' un confine di paragrafo se la riga prima chiude un periodo, se c'e'
 * una riga vuota, o se la riga dopo comincia con una maiuscola, un elenco o un numero di
 * paragrafo (titoli e voci). Altrimenti e' l'a capo di una riga lunga (PDF, mail, testo a righe
 * fisse) e le due righe si uniscono: prima ogni riga diventava un blocco a se', con una pausa
 * a ogni fine riga anche a meta' frase. Una parola sillabata a fine riga si ricompone.
 */
export function paragrafi(testo) {
  const righe = testo
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((r) => r.replace(/[ \t\f\v]+/g, ' ').trim());
  const out = [];
  let cur = '';
  for (const r of righe) {
    if (!r) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    if (!cur) {
      cur = r;
      continue;
    }
    const continua = !FINE_PERIODO.test(cur) && /^[\p{Ll}\d(«"“'‘,;]/u.test(r) && !/^\d+[.)]\s/.test(r);
    if (continua && /\p{L}-$/u.test(cur) && /^\p{Ll}/u.test(r)) cur = cur.slice(0, -1) + r; // sillabazione
    else if (continua) cur = `${cur} ${r}`;
    else {
      out.push(cur);
      cur = r;
    }
  }
  if (cur) out.push(cur);
  return out.filter((p) => /[\p{L}\p{N}]/u.test(p));
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
  const CRESCITA = lento ? 1.15 : CRESCITA_N;
  // limiteIniziale: per le sezioni dopo la prima (si continua con blocchi gia' cresciuti)
  // e per l'MP3, dove non serve partire presto ma conta la naturalezza di frasi intere
  const continua = Number.isFinite(opzioni.limiteIniziale) && opzioni.limiteIniziale > 0;
  // bloccoMax: tetto piu' basso (MP3), cosi' una lettura chiesta intanto aspetta poco il motore
  const MASSIMO = Number.isFinite(opzioni.bloccoMax) ? Math.max(LIMITE_MIN, Math.min(BLOCCO_MAX, opzioni.bloccoMax)) : BLOCCO_MAX;
  const PRIMO_MAX = continua ? Math.min(MASSIMO, opzioni.limiteIniziale) : lento ? 60 : PRIMO_MAX_N;
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
    limite = Math.min(MASSIMO, Math.max(LIMITE_MIN, Math.round(limite * 1.1), Math.round(lung(cur.fonemi) * CRESCITA)));
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
      if (!ultimo || cur.fineParagrafo || (!continua && out.length === 0 && lung(cur.fonemi) >= PRIMO_MIN)) chiudi();
    });
  }
  chiudi();
  // ultimaSezione false: dopo questo pezzo ne arrivano altri, quindi anche l'ultimo blocco ha la sua pausa
  const fine = opzioni.ultimaSezione === false ? -1 : out.length - 1;
  return out.map((b, i) => ({
    testo: b.testo,
    fonemi: b.fonemi,
    pausa: i === fine ? 0 : pausaDopo(b.fonemi) + (b.fineParagrafo ? PAUSA_PARAGRAFO - 0.25 : 0),
  }));
}

/** Limite di blocco con cui continuare dopo la prima sezione. */
export const LIMITE_SEZIONI = BLOCCO_MAX;

/**
 * Divide un testo lungo in sezioni sui confini di paragrafo, per prepararlo a tappe:
 * la prima e' corta (si sente presto), le altre si preparano mentre la prima suona.
 * Un paragrafo lunghissimo in testa si taglia a fine frase.
 */
export function dividiSezioni(testo, primo = 1200, altre = 12000) {
  const righe = String(testo).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = [];
  let lun = 0;
  const chiudi = () => {
    if (cur.length) out.push(cur.join('\n'));
    cur = [];
    lun = 0;
  };
  for (let r of righe) {
    if (!out.length && !lun && r.length > 2 * primo) {
      // prima riga enorme: il primo pezzo finisce alla prima fine di frase dopo `primo` caratteri
      const re = /[.!?…]+["'»”’)\]]*\s+(?=["'«“(]?\s*[\p{Lu}\p{N}])/gu;
      re.lastIndex = primo;
      const m = re.exec(r);
      if (m && m.index + m[0].length < r.length) {
        out.push(r.slice(0, m.index + m[0].length).trim());
        r = r.slice(m.index + m[0].length);
      }
    }
    cur.push(r);
    lun += r.length + 1;
    // si taglia solo dove la riga chiude un periodo (o prima di una riga vuota): mai a meta' frase
    if (lun >= (out.length ? altre : primo) && (!r.trim() || FINE_PERIODO.test(r.trim()))) chiudi();
  }
  chiudi();
  return out.filter((x) => /[\p{L}\p{N}]/u.test(x));
}

// ---- Lettura a blocchi decisi durante la lettura (dalla 1.2.0) ----
// Il testo si prepara in pezzi: frasi in fonemi, divise ai segni , ; : solo per poter
// partire presto (primo blocco) o per le frasi piu' lunghe di quanto il modello accetta.
// I blocchi si compongono mentre si legge (componiBlocco), con la misura vera del costo
// della sintesi: se il blocco successivo puo' non essere pronto in tempo, il passaggio cade a
// fine frase; a una virgola solo quando il motore e' abbastanza veloce da non far aspettare.

const MAX_FRASE = 400; // fonemi: oltre, una frase si divide agli incisi (il modello ne accetta 510)

/**
 * Pezzi del testo: { fonemi, fineFrase, fineParagrafo }. Ogni frase e' divisa ai suoi
 * incisi; la fine di frase e di paragrafo dice dove un blocco puo' chiudersi.
 */
export function pezzi(testo, fonemizza) {
  const out = [];
  for (const par of paragrafi(testo)) {
    const fr = frasi(par);
    fr.forEach((f, i) => {
      const fon = fonemizza(f);
      if (!fon) return;
      const incisi = fon
        .split(/(?<=[,;:—])\s+/u)
        .flatMap((x) => (lung(x) > MAX_FONEMI ? dividiFonemi(x, MAX_FONEMI) : [x]))
        .filter((x) => x.trim());
      // incisi cortissimi ("Inoltre,") si attaccano al successivo
      const uniti = [];
      for (const x of incisi) {
        if (uniti.length && lung(uniti[uniti.length - 1]) < 12) uniti[uniti.length - 1] += ` ${x}`;
        else uniti.push(x);
      }
      uniti.forEach((x, k) => {
        const ultimo = k === uniti.length - 1;
        const fineParagrafo = ultimo && i === fr.length - 1;
        // un titolo senza punto: il punto da' la pausa anche quando il titolo sta dentro un blocco
        const f = fineParagrafo && !/[.!?…:;,]["'»”’)\]]*$/u.test(x) ? `${x}.` : x;
        out.push({ fonemi: f, fineFrase: ultimo, fineParagrafo });
      });
    });
  }
  return out;
}

const pausaBlocco = (fonemi, fineParagrafo) => pausaDopo(fonemi) + (fineParagrafo ? PAUSA_PARAGRAFO - 0.25 : 0);

/**
 * Compone il blocco che parte dal pezzo `da`, al massimo di `limite` fonemi.
 * - primo blocco: si chiude anche a un inciso, e se il primo inciso e' piu' lungo del
 *   limite lo si divide a una parola (restituisce `dividi` per sostituire il pezzo);
 * - blocchi successivi: frasi intere, quante ne stanno nel limite. Se nemmeno la prima frase
 *   ci sta: con `virgole` (motore piu' veloce della voce) si chiude all'ultimo inciso che ci sta,
 *   perche' il blocco dopo arrivera' in tempo e la virgola non fa aspettare; senza, si prende la
 *   frase intera (meglio un'attesa a fine frase che tante attese alle virgole);
 * - il primo blocco non scavalca la fine del primo paragrafo; gli altri si'.
 * Restituisce { fonemi, a (pezzo dopo l'ultimo), pausa, dividi? }.
 */
export function componiBlocco(lista, da, limite, { primo = false, fineTesto = true, virgole = false } = {}) {
  let fonemi = '';
  let a = da;
  let ultimaFrase = -1; // indice dopo l'ultima fine di frase raccolta
  let fonemiFrase = '';
  while (a < lista.length) {
    const p = lista[a];
    const nuovo = fonemi ? `${fonemi} ${p.fonemi}` : p.fonemi;
    if (fonemi && lung(nuovo) > limite) {
      if (primo) break; // il primo blocco si chiude al confine d'inciso
      if (ultimaFrase > da) break; // ci sono gia' frasi intere: si chiude li'
      if (virgole && lung(fonemi) >= 30) break; // frase troppo lunga: si chiude a un inciso
      if (lung(nuovo) > MAX_FRASE + 100) break; // frase lunghissima: anche qui a un inciso
    }
    if (!fonemi && primo && lung(p.fonemi) > limite * 1.6) {
      // primo inciso troppo lungo per partire presto: si divide a una parola
      const parole = p.fonemi.split(' ');
      let testa = '';
      for (const w of parole) {
        if (testa && lung(`${testa} ${w}`) > limite) break;
        testa = testa ? `${testa} ${w}` : w;
      }
      const coda = p.fonemi.slice(testa.length).trim();
      if (coda) {
        return {
          fonemi: testa,
          a: da + 1,
          pausa: 0.05,
          dividi: [{ fonemi: testa, fineFrase: false, fineParagrafo: false }, { ...p, fonemi: coda }],
        };
      }
    }
    fonemi = nuovo;
    a++;
    if (p.fineFrase) {
      ultimaFrase = a;
      fonemiFrase = fonemi;
    }
    // il primo blocco finisce col primo paragrafo (spesso il titolo); gli altri possono
    // attraversare la fine di un paragrafo: con paragrafi brevi si pagano meno costi fissi
    if (primo && p.fineParagrafo) break;
    if (primo && lung(fonemi) >= limite * 0.6 && p.fineFrase) break;
  }
  // i blocchi dopo il primo si chiudono all'ultima fine di frase raccolta
  if (!primo && ultimaFrase > da && ultimaFrase < a) {
    a = ultimaFrase;
    fonemi = fonemiFrase;
  }
  const ultimo = lista[a - 1];
  const finito = fineTesto && a >= lista.length;
  return { fonemi, a, pausa: finito ? 0 : pausaBlocco(fonemi, ultimo && ultimo.fineParagrafo) };
}

/**
 * Limite di fonemi per il prossimo blocco, dato il margine di audio pronto (secondi) e il
 * costo della sintesi { fisso, perFonema, audio } in millisecondi.
 */
export function limiteDaMargine(margineS, k) {
  return Math.round(Math.min(420, Math.max(40, (0.85 * margineS * 1000 - k.fisso) / k.perFonema)));
}

/** true se il motore e' abbastanza piu' veloce della voce da poter chiudere un blocco a un inciso. */
export const virgoleConsentite = (k) => k.perFonema < 0.95 * k.audio;

/**
 * Sceglie quanto deve essere lungo il primo blocco. Simula l'inizio della lettura con il
 * costo misurato della sintesi per alcuni candidati (primo inciso, prima frase, prime
 * frasi, o un pezzo di inciso) e sceglie quello con il punteggio piu' basso:
 * attesa iniziale + 2 x la parte delle pause a fine frase oltre 0,3 s (fin li' la pausa
 * sembra quella naturale fra due frasi) + 4 x la pausa dopo un primo blocco tagliato a una
 * virgola o a meta' frase. L'attesa iniziale non supera 4 secondi, salvo che anche il
 * candidato piu' corto costi di piu'. Su un PC veloce vince un primo blocco corto; dove la
 * sintesi va quasi alla velocita' della voce si parte un po' dopo con una frase intera.
 * Restituisce { limite, primoMs, pauseMs, candidati }.
 */
const TOLLERANZA_MS = 300;
const ATTESA_MAX_MS = 4000;
export function pianoIniziale(lista, k, { orizzonteS = 60 } = {}) {
  const candidati = new Set();
  let n = 0;
  for (let i = 0; i < lista.length && n < 260; i++) {
    n += (i ? 1 : 0) + lung(lista[i].fonemi);
    candidati.add(n);
    if (lista[i].fineParagrafo) break;
  }
  // un primo blocco piu' corto del primo inciso (si taglia a una parola)
  const primoInciso = lista.length ? lung(lista[0].fonemi) : 0;
  for (const x of [20, 30, 45]) if (x < primoInciso / 1.6) candidati.add(x);
  let migliore = null;
  for (const lim of [...candidati].sort((x, y) => x - y)) {
    const copia = lista.slice(0, 80).map((p) => ({ ...p }));
    const b0 = componiBlocco(copia, 0, lim, { primo: true, fineTesto: false });
    if (b0.dividi) copia.splice(0, 1, ...b0.dividi);
    const n0 = lung(b0.fonemi);
    if (!b0.dividi && n0 > lim) continue; // il candidato non corrisponde a un confine
    const tagliato = !copia[b0.a - 1].fineFrase;
    let orologio = k.fisso + k.perFonema * n0;
    const primoMs = orologio;
    if (migliore && primoMs > ATTESA_MAX_MS) break; // i candidati sono in ordine di lunghezza
    let fineAudio = orologio + k.audio * n0 + b0.pausa * 1000;
    let cur = b0.a;
    let punteggio = primoMs;
    let pause = 0;
    let primaPausa = true;
    while (cur < copia.length && fineAudio - primoMs < orizzonteS * 1000) {
      const margine = Math.max(0, fineAudio - orologio) / 1000;
      const b = componiBlocco(copia, cur, limiteDaMargine(margine, k), { fineTesto: false, virgole: virgoleConsentite(k) });
      const nb = lung(b.fonemi);
      orologio += k.fisso + k.perFonema * nb;
      if (orologio > fineAudio) {
        const buco = orologio - fineAudio;
        pause += buco;
        punteggio += primaPausa && tagliato ? buco * 4 : Math.max(0, buco - TOLLERANZA_MS) * 2;
      }
      primaPausa = false;
      fineAudio = Math.max(fineAudio, orologio) + k.audio * nb + b.pausa * 1000;
      cur = b.a;
    }
    if (!migliore || punteggio < migliore.punteggio) migliore = { limite: Math.max(lim, n0), primoMs: Math.round(primoMs), pauseMs: Math.round(pause), punteggio };
  }
  return migliore || { limite: 60, primoMs: 0, pauseMs: 0 };
}
