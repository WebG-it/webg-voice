// Normalizzazione leggera del testo italiano prima di espeak.
//
// kokoro-onnx non normalizza nulla (solo strip): numeri, percentuali, valute e
// ordinali con "ª" li legge gia' bene espeak. Qui correggiamo solo i casi in cui
// espeak 1.52 sbaglia o suona male (verificati sui fonemi, vedi test/normalizza):
//   36.000 -> "trentasei. zero zero zero", 17/10/2026 -> "barra", 14:30 con pausa,
//   1° -> "uno gradi", km/h -> "kappa emme barra acca", https:// -> "acca ti ti pi..."
// Un testo senza questi casi arriva a espeak identico all'originale.

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const ORDINALI_M = ['', 'primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo',
  'ottavo', 'nono', 'decimo'];

// Abbreviazioni comuni: forma letta. Solo quelle che espeak non scioglie.
const ABBREVIAZIONI = [
  [/\bSig\.ra\b/g, 'signora'],
  [/\bSig\.na\b/g, 'signorina'],
  [/\bSigg\./g, 'signori'],
  [/\bSig\./g, 'signor'],
  [/\bDott\.ssa\b/g, 'dottoressa'],
  [/\bDott\./g, 'dottor'],
  [/\bDr\./g, 'dottor'],
  [/\bProf\.ssa\b/g, 'professoressa'],
  [/\bProf\./g, 'professor'],
  [/\bIng\./g, 'ingegner'],
  [/\bAvv\./g, 'avvocato'],
  [/\bArch\./g, 'architetto'],
  [/\bGeom\./g, 'geometra'],
  [/\bRag\./g, 'ragionier'],
  [/\bOn\./g, 'onorevole'],
  [/\bS\.p\.A\./g, 'esse pi a'],
  [/\bS\.r\.l\./g, 'esse erre elle'],
  [/\bD\.\s?Lgs\.?(?=\s|$)/g, 'decreto legislativo'],
  [/\bD\.L\.(?=\s|$)/g, 'decreto legge'],
  [/\bart\.(?=\s*\d)/gi, (m) => (m[0] === 'A' ? 'Articolo' : 'articolo')],
  [/\bpagg?\.(?=\s*\d)/g, 'pagina'],
  [/\bpp\.(?=\s*\d)/g, 'pagine'],
  [/\bn\.(?=\s*\d)/g, 'numero'],
  [/\bnn\.(?=\s*\d)/g, 'numeri'],
  [/\b([Ee])cc\.\.\./g, (m, e) => `${e}ccetera...`],
  [/\b([Ee])cc\.(?=\s*\n|\s*$|\s+\p{Lu})/gu, (m, e) => `${e}ccetera.`],
  [/\b([Ee])cc\.(?=\s*[,;:)]|\s+[a-zàèéìòù]|$)/g, (m, e) => `${e}ccetera`],
  [/\bvs\.?(?=\s)/g, 'contro'],
];

const UNITA = [
  [/km\/h\b/g, 'chilometri orari'],
  [/km\b/g, 'chilometri'],
  [/kg\b/g, 'chili'],
  [/cm\b/g, 'centimetri'],
  [/mm\b/g, 'millimetri'],
  [/m²|mq\b/g, 'metri quadri'],
  [/m³/g, 'metri cubi'],
  [/ms\b/g, 'millisecondi'],
  [/m\b(?![²³])/g, 'metri'],
  [/TB\b/g, 'terabyte'],
  [/GB\b/g, 'gigabyte'],
  [/MB\b/g, 'megabyte'],
  [/KB\b|kB\b/g, 'kilobyte'],
  [/kWh\b/g, 'chilowattora'],
  [/kW\b/g, 'chilowatt'],
  [/°C\b|° C\b/g, 'gradi'],
  [/°F\b/g, 'gradi Fahrenheit'],
];

function ora(h, m) {
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (hh > 24 || mm > 59) return null;
  return mm === 0 ? `${hh}` : `${hh} e ${mm}`;
}

// Apostrofo al posto dell'accento ("perche'", "citta'", "E'"): eSpeak sbaglia l'accento
// (pˈɛrke invece di perkˌe). Troncamenti che vogliono l'apostrofo e restano come sono:
const TRONCAMENTI = new Set(['po', 'mo', 'va', 'fa', 'sta', 'da', 'di', 'to', 'be', 'de', 'ca', 'pie']);
// parole con la "e" chiusa: perché, poiché, né, sé, ventitré...
const E_CHIUSA = /(?:ch|^n|^s|tr)e$/i;
const ACCENTI = { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' };

const LETTERA = /\p{L}/u;
const APICI = "'’‘";

/**
 * Converte l'apostrofo finale usato come accento: "E' vero" -> "È vero", "perche'" -> "perché",
 * "com'e'" -> "com'è". Non tocca le elisioni (l'albero, un'altra), i troncamenti (po', va')
 * ne' l'apice che chiude una citazione ('basta', 'ok'). Una citazione si apre con un apice
 * prima di una lettera (dopo uno spazio, un segno o un apostrofo d'elisione: l'‘albero’) e si
 * chiude col primo apice dopo una parola o un segno; si chiude comunque a fine frase e a capo.
 */
export function accentiDaApostrofo(t) {
  let out = '';
  let ultimo = 0;
  let aperta = false; // c'e' una citazione fra apici singoli aperta
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\n' || (/[.!?…]/.test(c) && (i + 1 === t.length || /\s/.test(t[i + 1])))) {
      aperta = false;
      continue;
    }
    if (!APICI.includes(c)) continue;
    const primaL = i > 0 && LETTERA.test(t[i - 1]);
    const dopoL = i + 1 < t.length && LETTERA.test(t[i + 1]);
    if (dopoL) {
      // elisione dentro una parola (l'albero) o apice che apre una citazione
      if (c === '‘' || !primaL) aperta = true;
      continue;
    }
    if (!primaL) {
      // apice dopo un segno ("'Basta!' disse"): chiude la citazione
      aperta = false;
      continue;
    }
    // apice dopo una parola: chiude la citazione o fa da accento
    let j = i;
    while (j > 0 && LETTERA.test(t[j - 1])) j--;
    const parola = t.slice(j, i);
    // dentro una citazione l'apice chiude, salvo che ne segua subito un altro ('perche'' =
    // 'perché'): allora questo e' l'accento e il prossimo chiude
    if (aperta && !(i + 1 < t.length && APICI.includes(t[i + 1]))) {
      aperta = false;
      continue;
    }
    if (c === '‘') continue;
    const v = parola[parola.length - 1];
    if (!ACCENTI[v] || TRONCAMENTI.has(parola.toLowerCase())) continue;
    let acc = ACCENTI[v];
    if ((v === 'e' || v === 'E') && E_CHIUSA.test(parola)) acc = v === 'e' ? 'é' : 'É';
    out += t.slice(ultimo, i - 1) + acc;
    ultimo = i + 1;
  }
  return out + t.slice(ultimo);
}

// Mail citata: le righe che cominciano con ">" sono il messaggio a cui si risponde e il segno
// si toglie. Citazione = un blocco di almeno due righe consecutive col ">" in cui almeno meta'
// delle righe non e' "> numero" (cosi' "> 2024 e' stato..." dentro una mail perde il segno),
// oppure piu' righe citate sparse che sono la maggioranza del testo. Un blocco fatto per lo piu'
// di "> numero" e' un elenco di requisiti ("> 18 anni / > 5 anni / > patente B"): il segno
// resta e davanti al numero si legge "maggiore di".
const CITATA = /^[ \t]*>/;
const CONFRONTO = /^[ \t]*>[ \t]?[-+]?\d/;
export function togliCitazioniRighe(righe) {
  const out = righe.slice();
  const togli = new Set();
  for (let k = 0; k < out.length; ) {
    if (!CITATA.test(out[k])) {
      k++;
      continue;
    }
    let f = k;
    while (f < out.length && CITATA.test(out[f])) f++;
    const blocco = out.slice(k, f);
    if (blocco.length >= 2 && blocco.filter((r) => !CONFRONTO.test(r)).length * 2 >= blocco.length) for (let x = k; x < f; x++) togli.add(x);
    k = f;
  }
  const piene = out.filter((r) => r.trim());
  const sparse = out.map((r, k) => (CITATA.test(r) && !CONFRONTO.test(r) ? k : -1)).filter((k) => k >= 0);
  if (sparse.length >= 2 && sparse.length > piene.length / 2) for (const k of sparse) togli.add(k);
  for (const k of togli) out[k] = out[k].replace(/^[ \t]*(?:>[ \t]?)+/, '');
  return out;
}
export function togliCitazioni(testo) {
  return togliCitazioniRighe(String(testo).replace(/\r\n?/g, '\n').split('\n')).join('\n');
}

// "<3" e' un cuore, non "minore di 3": attaccato al 3, senza altre cifre dopo e senza un'unita'
// di misura o un conteggio dopo ("<3 anni", "<3%" restano confronti).
const UNITA_CUORE = '(?:%|‰|°|€|\\$|anni|anno|mesi|mese|settimane|giorni|giorno|ore|ora|minuti|min|secondi|sec|volte|euro|dollari|punti|persone|figli|metri|chili|litri|gradi|pezzi|kg|hg|g|mg|mcg|µg|ml|cl|dl|l|mm|cm|m|km|kb|mb|gb|tb|kw|kwh|w|v|x)(?![\\p{L}])';
const CUORE = new RegExp(`(^|[\\s(])<3(?![\\d.,]?\\d)(?!\\s?${UNITA_CUORE})`, 'giu');

// Numeri interi in lettere (fino a 999.999.999), per l'elisione davanti a un numero.
const UNITA_L = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici',
  'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const DECINE_L = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
function sotto100(n) {
  if (n < 20) return UNITA_L[n];
  const u = n % 10;
  let d = DECINE_L[Math.floor(n / 10)];
  if (u === 0) return d;
  if (u === 1 || u === 8) d = d.slice(0, -1); // ventuno, ventotto
  return d + (u === 3 ? 'tré' : UNITA_L[u]);
}
function sotto1000(n) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let cs = c === 0 ? '' : c === 1 ? 'cento' : UNITA_L[c] + 'cento';
  if (!r) return cs || 'zero';
  if (cs && Math.floor(r / 10) === 8) cs = cs.slice(0, -1); // centottanta
  return cs + sotto100(r);
}
export function inLettere(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999999) return null;
  if (n < 1000) return sotto1000(n);
  const mi = Math.floor(n / 1e6);
  const k = Math.floor(n / 1000) % 1000;
  const r = n % 1000;
  const parti = [];
  if (mi) parti.push(mi === 1 ? 'un milione' : `${inLettere(mi)} milioni`);
  const resto = (k ? (k === 1 ? 'mille' : `${sotto1000(k)}mila`) : '') + (r ? sotto1000(r) : '');
  if (resto) parti.push(resto);
  return parti.join(' ');
}

// Elisione davanti a un numero: "l'8 settembre" -> "l'otto settembre" (eSpeak leggeva "elle
// otto"). L'apostrofo resta solo se il numero in lettere comincia per vocale (otto, undici, uno,
// ottanta, ottocento, un milione...); "l'1 settembre" si legge "il primo settembre". Gli altri
// casi ("l'2", un errore di battitura) restano come sono. Non tocca "'90" ne' "5' 30''".
const ARTICOLO_PIENO = { l: 'il', dell: 'del', all: 'al', nell: 'nel', dall: 'dal', sull: 'sul', coll: 'col', pell: 'pel', quell: 'quel', quest: 'questo', un: 'un' };
const ELISIONE_NUMERO = new RegExp(
  `(^|[^\\p{L}])(${Object.keys(ARTICOLO_PIENO).join('|')})['’](\\d+)(?![\\dº°])(,\\d+)?(\\s+(?:${MESI.join('|')})\\b)?`,
  'giu'
);
function elisioneNumero(t) {
  return t.replace(ELISIONE_NUMERO, (m, prima, art, num, dec, mese) => {
    const n = parseInt(num, 10);
    const pieno = ARTICOLO_PIENO[art.toLowerCase()];
    const maiusc = art[0] !== art[0].toLowerCase();
    const comeArt = (x) => (maiusc ? x[0].toUpperCase() + x.slice(1) : x);
    if (n === 1 && mese && !dec) return `${prima}${comeArt(pieno)} primo${mese}`;
    const parola = String(n) === num ? inLettere(n) : null; // niente zeri davanti
    if (!parola || !/^[aeiou]/.test(parola)) return m;
    const virgola = dec ? ` virgola ${dec.slice(1)}` : '';
    // "un'8" e' un errore per "un 8": si legge "un otto"
    const legato = art.toLowerCase() === 'un' ? `${art} ${parola}` : `${art}'${parola}`;
    return `${prima}${legato}${virgola}${mese || ''}`;
  });
}

export function normalizza(testo) {
  let t = accentiDaApostrofo(togliCitazioni(testo));

  // Spazi strani e caratteri invisibili
  t = t.replace(/[   ]/g, ' ').replace(/[​-‍﻿­]/g, '');

  // Indirizzi web: niente "acca ti ti pi esse barra barra"
  t = t.replace(/\bhttps?:\/\/(www\.)?/gi, (m, w) => (w ? 'www.' : ''));
  t = t.replace(/(\b[\w.-]+\.(?:it|com|org|net|eu|io))\/[^\s)]*/gi, '$1');

  for (const [re, s] of ABBREVIAZIONI) t = t.replace(re, s);

  // il cuore si toglie con lo spazio davanti: "Ciao <3." -> "Ciao."
  t = t.replace(CUORE, (m, prima) => (prima === '(' || prima === '\n' ? prima : ''));

  // Segni di confronto davanti a un numero ("> 18 anni", "<5 euro", "≥ 3"): eSpeak li scarta.
  // Solo davanti a una cifra, cosi' frecce e altri usi del segno restano come sono.
  t = t.replace(/(^|[\s(])(>=|≥|<=|≤|>|<)\s?(?=[-+]?\d)/g, (m, prima, segno) => {
    const parole = { '>=': 'maggiore o uguale a', '≥': 'maggiore o uguale a', '<=': 'minore o uguale a', '≤': 'minore o uguale a', '>': 'maggiore di', '<': 'minore di' };
    return `${prima}${parole[segno]} `;
  });

  // Date: 17/10/2026, 3/3/25, 17-10-2026 -> "17 ottobre 2026"
  t = t.replace(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m, g, me, a) => {
    const gi = parseInt(g, 10);
    const mi = parseInt(me, 10);
    if (gi < 1 || gi > 31 || mi < 1 || mi > 12) return m;
    const anno = a.length === 2 ? `${parseInt(a, 10) < 50 ? '20' : '19'}${a}` : a;
    return `${gi === 1 ? '1º' : gi} ${MESI[mi - 1]} ${anno}`;
  });
  // Numero/anno di leggi e atti: 196/2003 -> "196 del 2003"
  t = t.replace(/\b(\d{1,4})\/((?:19|20)\d{2})\b/g, '$1 del $2');

  // Orari: 14:30, 07:05; 8.30 solo dopo "ore", "alle", "dalle"... (altrimenti e' un decimale)
  t = t.replace(/\b(\d{1,2}):(\d{2})\b(?!:)/g, (m, h, mi) => ora(h, mi) ?? m);
  t = t.replace(/\b(ore|alle|dalle|le|entro le|verso le|fino alle)\s+(\d{1,2})\.(\d{2})\b/gi,
    (m, p, h, mi) => {
      const o = ora(h, mi);
      return o ? `${p} ${o}` : m;
    });

  // Migliaia col punto: 36.000, 2.500.000 -> 36000, 2500000 (espeak legge "36.000" male)
  t = t.replace(/\b\d{1,3}(?:\.\d{3})+\b(?![.,]\d)/g, (m) => m.replace(/\./g, ''));

  // Ordinali col simbolo di grado: "1° gennaio", "2° posto" (ma "20° C" resta temperatura)
  t = t.replace(/\b(\d{1,2})\s?°(?!\s?[CF]\b)(?=\s+[a-zàèéìòù])/g, (m, n) => {
    const k = parseInt(n, 10);
    return ORDINALI_M[k] || `${k}º`;
  });

  // Unita' di misura dopo un numero
  for (const [re, s] of UNITA) {
    t = t.replace(new RegExp(`(\\d)\\s?(?:${re.source})`, re.flags), `$1 ${s}`);
  }
  // 24h, 12h -> ore
  t = t.replace(/\b(\d{1,3})\s?h\b/g, '$1 ore');

  t = elisioneNumero(t);

  return t;
}
