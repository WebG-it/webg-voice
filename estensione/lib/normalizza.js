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

export function normalizza(testo) {
  let t = testo;

  // Spazi strani e caratteri invisibili
  t = t.replace(/[   ]/g, ' ').replace(/[​-‍﻿­]/g, '');

  // Indirizzi web: niente "acca ti ti pi esse barra barra"
  t = t.replace(/\bhttps?:\/\/(www\.)?/gi, (m, w) => (w ? 'www.' : ''));
  t = t.replace(/(\b[\w.-]+\.(?:it|com|org|net|eu|io))\/[^\s)]*/gi, '$1');

  for (const [re, s] of ABBREVIAZIONI) t = t.replace(re, s);

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

  return t;
}
