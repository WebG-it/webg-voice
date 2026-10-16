// Divide un testo in paragrafi e frasi, poi raggruppa le frasi (gia' in fonemi)
// in blocchi da sintetizzare uno alla volta: il primo corto, per partire subito,
// i successivi piu' lunghi, perche' Kokoro suona piu' naturale su frasi intere.

import { dividiFonemi, pausaDopo, MAX_FONEMI } from './fonemi.js';
import { togliCitazioniRighe } from './normalizza.js';

// Parole dopo cui il punto non chiude la frase (se non sono gia' state sciolte)
const ABBR = new Set(['sig', 'sigg', 'dott', 'dr', 'prof', 'ing', 'avv', 'arch', 'geom', 'rag',
  'on', 'ecc', 'etc', 'art', 'pag', 'pagg', 'pp', 'n', 'nn', 'cap', 'cfr', 'es', 'vol', 'fig',
  'tel', 'sec', 'ca', 'circa', 'st', 'mr', 'mrs', 'ms', 'vs', 'p', 'c', 'v', 'lett', 'int']);

// Fine di riga che chiude davvero un periodo
const FINE_PERIODO = /[.!?…:;]["'»”’)\]]*$/u;

// Parole che a fine riga tengono il trattino quando continuano sulla riga dopo (nord-est,
// ex-marito, euro-atlantico). Solo prefissi che non sono anche l'inizio di parole comuni: con
// pro, co, pre, eco, tele "pro-getto", "co-munita'", "pre-sidente" restavano spezzati.
const PREFISSI_TRATTINO = new Set([
  'nord', 'sud', 'est', 'ovest', 'centro', 'ex', 'anti', 'post', 'socio', 'euro', 'italo', 'anglo', 'afro', 'ispano',
]);
const ELENCO = /^([-•*–·▪◦]|\d+[.)]|[a-z][.)])\s/u;

// Parole che non possono chiudere una frase ne' un titolo: una riga che finisce cosi' e' spezzata.
// Non ci sono "piu'" e "come", che chiudono pulsanti e inviti ("Scopri di piu'", "Leggi di piu'").
const NON_FINALI = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'l', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'e', 'ed', 'o', 'od', 'che', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli',
  'alle', 'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul',
  'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'col', 'coi', 'ma', 'se', 'non', 'cui', 'quale',
]);
// parola finale che non chiude: solo in minuscolo (una sigla come TO o IL resta una sigla)
const nonFinale = (riga) => {
  const p = (riga.match(/([\p{L}]+)$/u) || [])[1];
  return !!p && p === p.toLowerCase() && NON_FINALI.has(p);
};

/** true se fra la riga `a` e la riga `b` c'e' un segno di frase spezzata a capo. */
function spezzata(a, b) {
  if (/^[\p{Ll}\d]/u.test(b)) return true; // la riga dopo continua in minuscolo o con una cifra
  if (/[,\-]$/.test(a)) return true; // virgola o trattino a fine riga
  return nonFinale(a);
}

/**
 * Larghezza delle righe di un testo "a righe fisse" (PDF, mail, testo copiato da un riquadro
 * stretto), oppure 0 se non lo e'. Servono due cose: almeno tre righe lunghe con meta' almeno
 * vicine alla larghezza massima, entro i 200 caratteri; e almeno meta' dei passaggi fra righe
 * lunghe con un segno di frase spezzata (spezzata()). Senza il secondo controllo titoli di
 * giornale, voci lunghe o citazioni di larghezza simile, uno per riga, finivano in un paragrafo.
 */
function larghezzaRighe(righe) {
  const lunghe = righe.map((r) => r.length).filter((n) => n >= 20).sort((a, b) => a - b);
  if (lunghe.length < 3) return 0;
  const larga = lunghe[Math.floor((lunghe.length - 1) * 0.9)];
  if (larga > 200) return 0;
  const vicine = lunghe.filter((n) => n >= larga * 0.7).length;
  if (vicine < lunghe.length * 0.5) return 0;
  let passaggi = 0;
  let segni = 0;
  for (let k = 0; k < righe.length - 1; k++) {
    const a = righe[k];
    const b = righe[k + 1];
    if (!a || !b || a.length < larga * 0.6 || FINE_PERIODO.test(a)) continue;
    passaggi++;
    if (spezzata(a, b)) segni++;
  }
  return passaggi && segni >= passaggi * 0.5 ? larga : 0;
}

/** Unisce `cur` (fine di riga) e `r` (riga dopo) quando la riga di prima e' spezzata. */
function unisci(cur, r) {
  // trattino a fine riga
  const t = /(\S*?)(\p{L}+|\d+)-$/u.exec(cur);
  if (t) {
    const parola = t[2];
    // davanti a una cifra, dopo una sigla in maiuscolo o dopo un prefisso il trattino resta
    if (/^\d/.test(r) || /^\p{Lu}{2,}$/u.test(parola) || /^\d+$/.test(parola) || PREFISSI_TRATTINO.has(parola.toLowerCase())) return cur + r;
    if (/^\p{Ll}/u.test(r)) return cur.slice(0, -1) + r; // sillabazione: docu-menti
    return cur + r;
  }
  return `${cur} ${r}`;
}

/**
 * Paragrafi. Una riga vuota e' sempre un confine. Nei testi a righe fisse (larghezzaRighe) una
 * riga lunga che non chiude un periodo continua nella riga dopo, anche se questa comincia con
 * una maiuscola (un nome, "Stati Uniti"); le righe corte, cioe' titoli, voci di elenco,
 * indirizzi, restano a se'. Una riga che finisce con una cifra seguita da una che comincia con
 * una cifra (civico e CAP) resta un confine. Negli altri testi ogni a capo e' un confine, salvo
 * la parola spezzata col trattino a fine riga. Il trattino morbido (U+00AD) si toglie.
 */
export function paragrafi(testo) {
  let righe = String(testo)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00AD[ \t]*\n[ \t]*/g, '')
    .replace(/\u00AD/g, '')
    .split('\n')
    .map((r) => r.replace(/[ \t\f\v]+/g, ' ').trim());
  // mail citata: via il ">" (stessa regola di normalizza, vedi togliCitazioniRighe)
  righe = togliCitazioniRighe(righe);
  const larga = larghezzaRighe(righe);
  const out = [];
  let cur = '';
  let ultima = ''; // ultima riga fisica raccolta in `cur`
  for (const r of righe) {
    if (!r) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    if (!cur) {
      cur = ultima = r;
      continue;
    }
    const trattino = /[\p{L}\d]-$/u.test(ultima) && /^[\p{Ll}\d]/u.test(r);
    const aRighe = larga && ultima.length >= larga * 0.6 && !FINE_PERIODO.test(ultima);
    const confine = ELENCO.test(r) || (/\d$/.test(ultima) && /^\d/.test(r) && !/-$/.test(ultima));
    // in ogni testo: riga che finisce con una virgola o con una parola che non chiude una frase
    // ("fissata per il / 12 ottobre", "Torino, / Milano, / Roma"); la minuscola da sola non basta
    const forte = /,$/.test(ultima) || nonFinale(ultima);
    // riga lunga senza punto seguita da una minuscola: e' la stessa frase anche in un testo corto
    const lungaSpezzata = ultima.length >= 50 && !FINE_PERIODO.test(ultima) && /^\p{Ll}/u.test(r);
    if (!confine && (trattino || aRighe || forte || lungaSpezzata)) cur = unisci(cur, r);
    else {
      out.push(cur);
      cur = r;
    }
    ultima = r;
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
 * Taglia una riga troppo lunga in pezzi di al massimo `max` caratteri: all'ultima fine di frase
 * che ci sta, altrimenti all'ultimo spazio, e solo come ultima risorsa a `max` esatto.
 */
function tagliaRiga(r, max) {
  const out = [];
  while (r.length > max) {
    const finestra = r.slice(0, max + 1);
    let i = -1;
    const re = /[.!?…]+["'»”’)\]]*\s+/gu;
    let m;
    while ((m = re.exec(finestra))) if (m.index > max * 0.3) i = m.index + m[0].length;
    if (i < 0) {
      const s = finestra.lastIndexOf(' ');
      i = s > max * 0.3 ? s + 1 : max;
    }
    out.push(r.slice(0, i).trimEnd());
    r = r.slice(i).trimStart();
  }
  out.push(r);
  return out;
}

/**
 * Divide un testo lungo in sezioni, per prepararlo a tappe: la prima e' corta (si sente presto),
 * le altre si preparano mentre la prima suona. Una sezione si chiude dove una riga chiude un
 * periodo; una riga piu' lunga della sezione si taglia a fine frase (a parola come ultima
 * risorsa), e nessuna sezione supera 1,25 volte la sua misura anche senza punteggiatura.
 * I pezzi di una stessa riga restano uniti da uno spazio, le righe da un a capo.
 */
export function dividiSezioni(testo, primo = 1200, altre = 12000) {
  const righe = String(testo).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = '';
  let iniziata = false;
  let ultimoPunto = -1; // in `cur`, posizione dopo l'ultimo pezzo che chiude un periodo
  const chiudi = () => {
    if (iniziata) out.push(cur);
    cur = '';
    iniziata = false;
    ultimoPunto = -1;
  };
  for (const riga of righe) {
    const pezzi = tagliaRiga(riga, primo);
    pezzi.forEach((p, k) => {
      const misura = out.length ? altre : primo;
      const sep = !iniziata ? '' : k ? ' ' : '\n';
      if (iniziata && cur.length + sep.length + p.length > misura * 1.25) {
        // tetto: si chiude all'ultimo punto fermo raccolto, se c'e', e il resto passa avanti
        if (ultimoPunto > 0 && ultimoPunto < cur.length) {
          const resto = cur.slice(ultimoPunto + 1);
          cur = cur.slice(0, ultimoPunto);
          chiudi();
          cur = resto;
          iniziata = resto.length > 0;
        } else chiudi();
      }
      cur += (iniziata ? (k ? ' ' : '\n') : '') + p;
      iniziata = true;
      if (!p.trim() || FINE_PERIODO.test(p.trim())) ultimoPunto = cur.length;
      if (cur.length >= (out.length ? altre : primo) && ultimoPunto === cur.length) chiudi();
    });
  }
  chiudi();
  return out.filter((x) => /[\p{L}\p{N}]/u.test(x));
}

// ---- Lettura a blocchi decisi durante la lettura (dalla 1.2.0) ----
// Il testo si prepara in pezzi: frasi in fonemi, divise ai segni , ; : solo per poter
// partire presto (primo blocco) o per le frasi piu' lunghe di quanto il modello accetta.
// I blocchi si compongono mentre si legge (componiBlocco), con la misura vera del costo
// della sintesi (regolaBlocco): un blocco si chiude all'ultima fine di frase che sta nel limite,
// e solo se nemmeno una frase ci sta all'ultimo inciso (virgola, punto e virgola, due punti).

const MAX_FRASE = 400; // fonemi: oltre, una frase si divide agli incisi (il modello ne accetta 510)

/**
 * Pezzi del testo: { fonemi, fineFrase, fineParagrafo }. Ogni frase e' divisa ai suoi
 * incisi; la fine di frase e di paragrafo dice dove un blocco puo' chiudersi.
 */
export function pezzi(testo, fonemizza) {
  const out = [];
  for (const par of paragrafi(testo)) {
    const fr = frasi(par);
    // titolo vero: paragrafo breve senza punteggiatura finale (non una riga spezzata)
    const titolo = par.length <= 150 && !/[.!?…:;,]["'»”’)\]]*$/u.test(par);
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
        const fonemi = fineParagrafo && titolo && !/[.!?…:;,]["'»”’)\]]*$/u.test(x) ? `${x}.` : x;
        // testo: la frase scritta, sul suo primo pezzo (serve a evidenziarla nella pagina)
        out.push({ fonemi, fineFrase: ultimo, fineParagrafo, testo: k === 0 ? f : '' });
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
 * - blocchi successivi: frasi intere, quante ne stanno nel limite; se nemmeno la prima frase ci
 *   sta, si chiude all'ultimo inciso che ci sta (almeno 20 fonemi). Il limite lo decide
 *   regolaBlocco, perche' il blocco dopo arrivi in tempo o l'attesa resti breve;
 * - il primo blocco non scavalca la fine del primo paragrafo; gli altri si'.
 * Restituisce { fonemi, a (pezzo dopo l'ultimo), pausa, dividi? }.
 */
export function componiBlocco(lista, da, limite, { primo = false, fineTesto = true, unaFrase = false, pausaFrase = 0 } = {}) {
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
      if (lung(fonemi) >= 20) break; // frase piu' lunga del limite: si chiude a un inciso
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
          // la testa porta il testo della frase (serve a evidenziarla), la coda no
          dividi: [{ fonemi: testa, fineFrase: false, fineParagrafo: false, testo: p.testo || '' }, { ...p, fonemi: coda, testo: '' }],
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
    if (unaFrase && p.fineFrase) break; // "Rileggi la bozza": una frase per blocco
  }
  // i blocchi dopo il primo si chiudono all'ultima fine di frase raccolta
  if (!primo && ultimaFrase > da && ultimaFrase < a) {
    a = ultimaFrase;
    fonemi = fonemiFrase;
  }
  const ultimo = lista[a - 1];
  const finito = fineTesto && a >= lista.length;
  const extra = ultimo && ultimo.fineFrase ? pausaFrase : 0; // pausa in piu' fra le frasi (bozza)
  return { fonemi, a, pausa: finito ? 0 : pausaBlocco(fonemi, ultimo && ultimo.fineParagrafo) + extra };
}

/**
 * Limite di fonemi per il prossimo blocco, dato il margine di audio pronto (secondi) e il
 * costo della sintesi { fisso, perFonema, audio } in millisecondi.
 */
export function limiteDaMargine(margineS, k) {
  return Math.round(Math.min(420, Math.max(40, (0.85 * margineS * 1000 - k.fisso) / k.perFonema)));
}

/** true se la sintesi e' abbastanza piu' veloce della voce da recuperare margine a ogni blocco. */
export const motoreVeloce = (k) => k.perFonema < 0.95 * k.audio;

// Attesa massima voluta fra due blocchi quando la sintesi non e' piu' veloce della voce
const ATTESA_LENTO_MS = 3000;

/**
 * Limite di fonemi per il blocco dopo il primo, dato l'audio pronto davanti (secondi) e il costo.
 * - Sintesi piu' veloce della voce: il blocco e' grande quanto il margine permette, cosi' arriva
 *   prima che finisca l'audio in coda e il passaggio non si sente.
 * - Sintesi lenta come la voce o piu': le attese ci saranno comunque (il silenzio totale e' circa
 *   la sintesi totale meno la durata della voce) e conta che siano brevi: il blocco si dimensiona
 *   perche' l'attesa resti intorno ai 3 secondi (fra 90 e 160 fonemi). Di solito l'attesa cade a
 *   fine frase; in una frase piu' lunga del limite puo' cadere a una virgola.
 */
export function regolaBlocco(margineS, k) {
  if (motoreVeloce(k)) return limiteDaMargine(margineS, k);
  const n = (margineS * 1000 + ATTESA_LENTO_MS - k.fisso) / k.perFonema;
  // almeno 90 fonemi: blocchi piu' piccoli pagano troppi costi fissi e allungano il silenzio totale
  return Math.round(Math.min(160, Math.max(90, n)));
}

/**
 * Sceglie quanto deve essere lungo il primo blocco. Simula l'inizio della lettura con il
 * costo misurato della sintesi per alcuni candidati (primo inciso, prima frase, prime
 * frasi, o un pezzo di inciso) e sceglie quello con il punteggio piu' basso:
 * attesa iniziale + 2 x la parte delle pause a fine frase oltre 0,3 s (fin li' la pausa
 * sembra quella naturale fra due frasi) + 4 x la pausa dopo un primo blocco tagliato a una
 * virgola o a meta' frase. L'attesa iniziale non supera 2 secondi, salvo che anche il
 * candidato piu' corto costi di piu'. Su un PC veloce vince un primo blocco corto; dove la
 * sintesi va quasi alla velocita' della voce si parte un po' dopo con una frase intera.
 * Restituisce { limite, primoMs, pauseMs, candidati }.
 */
const TOLLERANZA_MS = 300;
const ATTESA_MAX_MS = 2000;
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
      const b = componiBlocco(copia, cur, regolaBlocco(margine, k), { fineTesto: false });
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
