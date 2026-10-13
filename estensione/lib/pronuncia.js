// Pronuncia di parole particolari nel testo italiano: dizionario personale,
// sigle e parole inglesi. Lavora PRIMA della fonemizzazione e lascia invariato
// il testo italiano normale (la parita' con kokoro-onnx resta sulle frasi italiane).

// ---- Dizionario personale (opzioni) ----

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Applica le coppie [scritto, lettura] come parole intere, senza distinguere
 * maiuscole e minuscole. Le chiavi piu' lunghe prima, cosi' "Search Console" vince su "Search".
 */
export function applicaDizionario(testo, voci) {
  if (!Array.isArray(voci) || !voci.length) return testo;
  const ordinate = voci
    .filter((v) => Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0].trim())
    .sort((a, b) => b[0].length - a[0].length);
  let t = testo;
  for (const [scritto, lettura] of ordinate) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(scritto.trim())}(?![\\p{L}\\p{N}])`, 'giu');
    const sostituto = lettura.trim();
    t = t.replace(re, () => sostituto); // funzione: "$&" e "$1" restano testo letterale
  }
  return t;
}

// ---- Sigle in maiuscolo ----

// Nomi italiani delle lettere, per le sigle che si compitano
const LETTERE = {
  A: 'a', B: 'bi', C: 'ci', D: 'di', E: 'e', F: 'effe', G: 'gi', H: 'acca', I: 'i', J: 'i lunga',
  K: 'cappa', L: 'elle', M: 'emme', N: 'enne', O: 'o', P: 'pi', Q: 'cu', R: 'erre', S: 'esse',
  T: 'ti', U: 'u', V: 'vu', W: 'doppia vu', X: 'ics', Y: 'ipsilon', Z: 'zeta',
};

// Sigle che in italiano si dicono come parola
export const SIGLE_PAROLA = new Set([
  'RAM', 'ROM', 'SEO', 'NATO', 'ANSA', 'ISTAT', 'FIAT', 'LED', 'PIN', 'IVA', 'INPS', 'INAIL', 'COVID',
  'NASA', 'ONU', 'UNESCO', 'UNICEF', 'FIFA', 'UEFA', 'CONI', 'RAI', 'ENI', 'ENEL', 'ATAC', 'SPID', 'PEC',
  'CAP', 'IBAN', 'ISEE', 'IMU', 'TARI', 'IRPEF', 'IRES', 'IRAP', 'NASPI', 'AIDS', 'LAN', 'WAN', 'SIM',
  'GIF', 'LUISS', 'CONSOB', 'FAO', 'OCSE', 'CAF', 'TAR', 'TAV', 'SUV', 'DOC', 'DOP', 'IGP',
  'MIUR', 'MEF', 'ANAS', 'ACI', 'COOP', 'IKEA', 'LEGO', 'NAS', 'SIAE', 'UIL', 'BOT',
  'SAAS',
]);

// Sigle che si compitano all'italiana (anche se l'euristica le direbbe parole)
export const SIGLE_COMPITATE = new Set([
  'USB', 'CPU', 'GPU', 'PDF', 'HTML', 'CSS', 'API', 'URL', 'SMS', 'TV', 'PC', 'GPS', 'DNS', 'VPN',
  'SSD', 'HDMI', 'HD', 'DVD', 'CD', 'IT', 'AI', 'IA', 'ID', 'UE', 'USA', 'UK', 'SPA', 'SRL', 'SNC',
  'ASL', 'CGIL', 'CISL', 'CCNL', 'ERP', 'CRM', 'PMI', 'PIL', 'IP', 'QR', 'NFC', 'ATM', 'FAQ',
  'BMW', 'KTM', 'CNR', 'INGV', 'ISS', 'CEI', 'FS', 'PD', 'IRCCS', 'ADSL', 'DSL', 'SSL', 'HTTP',
  'HTTPS', 'WWW', 'FTP', 'SDK', 'UX', 'UI', 'PR', 'HR', 'B2B', 'B2C', 'MMS', 'LCD', 'RGB',
  'DPI', 'GB', 'MB', 'KB', 'TB', 'CV', 'DJ', 'MC',
]);

// Sigle che si dicono all'inglese (si fonemizzano con la voce inglese)
export const SIGLE_INGLESI = new Set(['CEO', 'CFO', 'CTO', 'OK', 'IOS', 'DIY', 'ASAP']);

// Parole italiane brevi che in un titolo in maiuscolo non vanno compitate
const PAROLE_BREVI = new Set(['NO', 'SI', 'SÌ', 'IO', 'TU', 'IL', 'LA', 'LO', 'LE', 'LI', 'DI', 'DA', 'IN',
  'SU', 'MA', 'ED', 'AD', 'OD', 'MI', 'TI', 'CI', 'VI', 'NE', 'SE', 'HA', 'HO', 'UN', 'UNO', 'GLI', 'AL', 'DEL', 'NEL', 'COL', 'SUL']);

const NUMERO_ROMANO = /^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const VOCALI = /[AEIOU]/;
const ATTACCHI = new Set(['BR', 'CR', 'DR', 'FR', 'GR', 'PR', 'TR', 'VR', 'BL', 'CL', 'FL', 'GL', 'PL', 'CH',
  'GH', 'GN', 'SB', 'SC', 'SD', 'SF', 'SG', 'SL', 'SM', 'SN', 'SP', 'ST', 'SV', 'QU']);

/** Euristica: una sigla sconosciuta si legge come parola italiana? */
export function pronunciabile(s) {
  if (s.length < 3 || !VOCALI.test(s)) return false;
  if (/[^AEIOU]{3}/.test(s.replace(/STR|SCR|SPR/g, 'S'))) return false; // tre consonanti di fila
  const inizio = s.slice(0, 2);
  if (!VOCALI.test(inizio) && !ATTACCHI.has(inizio)) return false;
  if (/[^AEIOU]{2}$/.test(s)) return false; // finisce con due consonanti (es. INPS si dice parola, ma e' in lista)
  if (/[JKWXY]/.test(s)) return false;
  return true;
}

export const compita = (s) => [...s].map((c) => LETTERE[c] || c).join(' ');

/** Come leggere una sigla: { modo: 'parola'|'compitata'|'inglese'|null, testo } */
export function leggiSigla(s) {
  if (SIGLE_INGLESI.has(s)) return { modo: 'inglese', testo: s };
  if (SIGLE_COMPITATE.has(s)) return { modo: 'compitata', testo: compita(s) };
  if (SIGLE_PAROLA.has(s)) return { modo: 'parola', testo: s.toLowerCase() };
  if (NUMERO_ROMANO.test(s) || PAROLE_BREVI.has(s)) return { modo: null, testo: s };
  if (s.length > 6) return { modo: 'parola', testo: s.toLowerCase() }; // parola di un titolo in maiuscolo
  return pronunciabile(s) ? { modo: 'parola', testo: s.toLowerCase() } : { modo: 'compitata', testo: compita(s) };
}

// ---- Parole inglesi ----

// Parole e nomi inglesi comuni nei testi italiani (confronto in minuscolo)
export const PAROLE_INGLESI = new Set(`
download upload browser email e-mail mail smart smartphone smartwatch online offline web website social link
password account cloud computer laptop notebook tablet mouse software hardware chat post blog feedback team
meeting marketing manager management business privacy cookie cookies server client router update newsletter
brand design designer startup podcast streaming streamer influencer follower followers like share hashtag
login logout username backup reset device gadget app apps store shop shopping weekend week-end look trend
performance workshop training coach coaching leader leadership budget report dashboard
stakeholder feature bug fix release deploy cache tutorial gaming gamer player playlist smart-working
coworking fitness wellness selfie fake news breaking ticket check-in checkout check-out booking review
reviews rating free cool happy hour green screen
display touch touchscreen wireless bluetooth wi-fi wifi hotspot router firewall spam phishing malware
hacker cyber security tool tools plugin widget template theme framework frontend backend developer
search console analytics ads keyword keywords ranking traffic engagement reach insight insights call
`.trim().split(/\s+/));

export const NOMI_INGLESI = new Set(`
google youtube whatsapp facebook instagram iphone ipad imac macbook apple microsoft windows amazon netflix
cloudflare linkedin tiktok twitter chrome firefox android spotify zoom teams office excel powerpoint outlook
gmail github gitlab openai chatgpt alexa siri kindle playstation xbox nintendo samsung huawei xiaomi tesla
uber airbnb booking paypal ebay dropbox slack skype telegram pinterest reddit wordpress joomla shopify
canva figma notion trello asana zapier mailchimp brevo calendly stripe vhelper
`.trim().split(/\s+/));

// Coppie di parole che vanno insieme ("Search Console", "Google Analytics")
const FRASI_INGLESI = ['search console', 'google analytics', 'google ads', 'smart tv', 'smart working', 'black friday',
  'cyber monday', 'call center', 'customer care', 'social media', 'social network', 'web agency', 'home page', 'landing page'];

/** La parola (senza punteggiatura) va letta in inglese? */
export function inglese(p) {
  if (/[àèéìíòóùú]/i.test(p)) return false;
  const l = p.toLowerCase();
  if (PAROLE_INGLESI.has(l) || NOMI_INGLESI.has(l)) return true;
  if (/^[A-Z]{2,6}$/.test(p)) return SIGLE_INGLESI.has(p);
  // CamelCase interno: iPhone, WhatsApp, VHelper, YouTube
  if (/[a-z][A-Z]/.test(p) || /^[A-Z]{1,2}[A-Z][a-z]/.test(p)) return true;
  // indizi ortografici che l'italiano non ha
  if (/(sh|th|ck|oo|ee|w)/i.test(p) || /[a-z]{3,}ing$/i.test(p) || /y$/i.test(p)) return true;
  return false;
}

/** Spezza il CamelCase: "VHelper" -> "V Helper", "WhatsApp" -> "Whats App", "iPhone" -> "i Phone". */
export function spezzaCamel(p) {
  return p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

/**
 * Prepara il testo: sigle sostituite con la loro lettura e segmenti in lingua.
 * @returns {{lingua: 'it'|'en', testo: string}[]}
 */
export function segmenta(testo) {
  // 1) sigle in maiuscolo (con eventuali cifre, es. B2B) che non sono inglesi
  let t = testo.replace(/(?<![\p{L}\p{N}])[A-Z][A-Z0-9]{1,5}(?![\p{L}\p{N}])/gu, (s) => {
    if (/\d/.test(s) && !SIGLE_COMPITATE.has(s)) return s;
    // le compitate restano in maiuscolo: espeak le compita gia' bene, con l'accento giusto;
    // si interviene solo dove sbaglia (sigle da dire come parola)
    const r = leggiSigla(s);
    return r.modo === 'parola' ? r.testo : s;
  });
  // 2) parole inglesi: segmenti
  const re = /[\p{L}\p{N}]+(?:[-][\p{L}\p{N}]+)*/gu;
  const parti = [];
  let ultimo = 0;
  const parole = [...t.matchAll(re)];
  // segna le frasi di due parole
  const forzate = new Set();
  for (let i = 0; i + 1 < parole.length; i++) {
    const tra = t.slice(parole[i].index + parole[i][0].length, parole[i + 1].index);
    if (/^\s+$/.test(tra) && FRASI_INGLESI.includes(`${parole[i][0]} ${parole[i + 1][0]}`.toLowerCase())) {
      forzate.add(i);
      forzate.add(i + 1);
    }
  }
  let corrente = null;
  const chiudi = (fine) => {
    if (!corrente) return;
    parti.push(corrente);
    corrente = null;
  };
  parole.forEach((m, i) => {
    const en = forzate.has(i) || inglese(m[0]);
    const tra = t.slice(ultimo, m.index);
    if (en) {
      // tra due parole inglesi separate solo da spazi o trattini si resta in inglese
      if (corrente && corrente.lingua === 'en' && /^[\s-]*$/.test(tra)) corrente.testo += tra + spezzaCamel(m[0]);
      else {
        if (corrente && corrente.lingua === 'it') corrente.testo += tra;
        else {
          chiudi();
          if (tra) parti.push({ lingua: 'it', testo: tra });
        }
        chiudi();
        corrente = { lingua: 'en', testo: spezzaCamel(m[0]) };
      }
    } else {
      if (corrente && corrente.lingua === 'it') corrente.testo += tra + m[0];
      else {
        chiudi();
        corrente = { lingua: 'it', testo: tra + m[0] };
      }
    }
    ultimo = m.index + m[0].length;
  });
  if (corrente) {
    if (corrente.lingua === 'it') corrente.testo += t.slice(ultimo);
    parti.push(corrente);
    if (corrente.lingua === 'en' && t.slice(ultimo)) parti.push({ lingua: 'it', testo: t.slice(ultimo) });
  } else if (t) parti.push({ lingua: 'it', testo: t });
  return parti.filter((p) => p.testo.length);
}

/**
 * Fonemizzazione mista. La frase si fonemizza intera in italiano, con ogni segmento
 * inglese sostituito da un segnaposto ("tatatà"): cosi' articoli e preposizioni attorno
 * restano come in una frase normale. Poi al posto dei fonemi del segnaposto vanno
 * quelli del segmento inglese, fatti con la voce inglese di espeak, senza marcatori.
 */
const SEGNAPOSTO = 'tatatà';
const RE_SEGNAPOSTO = /t[ˈˌ]?aː?t[ˈˌ]?aː?t[ˈˌ]?aː?/;

export function creaFonemizzatoreMisto(fonIt, fonEn) {
  return function fonemizza(testo) {
    const parti = segmenta(testo);
    const inglesi = parti.filter((p) => p.lingua === 'en');
    const testoIt = parti.map((p) => (p.lingua === 'en' ? SEGNAPOSTO : p.testo)).join('');
    let f = fonIt(testoIt);
    if (!inglesi.length) return f;
    for (const p of inglesi) {
      if (!RE_SEGNAPOSTO.test(f)) return fonIt(testo); // imprevisto: si torna alla lettura italiana
      f = f.replace(RE_SEGNAPOSTO, () => fonEn(p.testo));
    }
    return f.replace(/\s+/g, ' ').trim();
  };
}
