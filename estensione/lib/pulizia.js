// Pulizia italiana del testo dettato, deterministica e a costo zero (niente modelli):
// via esitazioni e ripetizioni, autocorrezioni ("no anzi", "cioe' volevo dire"),
// punteggiatura e "a capo" a voce, elenchi, maiuscole, comandi ("cancella l'ultima frase"),
// sostituzioni del dizionario personale. Mai trattini come incisi nel testo prodotto.
//
// Il testo arriva a segmenti (uno per pausa): creaSessione() tiene lo stato fra un segmento
// e l'altro (fine frase in sospeso, elenco in corso).

const L = '\\p{L}\\p{N}';
const prima = `(?<![${L}])`;
const dopo = `(?![${L}])`;
const parola = (s) => new RegExp(`${prima}(?:${s})${dopo}`, 'giu');

// segni che Whisper mette da solo attorno a un comando detto a voce: si assorbono
const ATTORNO = '[\\s,.;:!?…]*';
// per a capo, parentesi e virgolette: prima si tiene la punteggiatura di Whisper (resta la virgola
// di "Caro Marco,"), dopo parentesi e virgolette chiuse si tiene il punto finale
const SOLO_SPAZI = '\\s*';
const SPAZI_VIRGOLE = '[\\s,]*';

// Comandi di punteggiatura e impaginazione. Ordine: prima i piu' lunghi.
// `escludiPrima`: parole che, subito prima, fanno del termine una parola normale ("il punto").
const ARTICOLI = 'il|lo|la|un|uno|una|al|allo|alla|del|dello|della|nel|nello|nella|sul|sullo|sulla|dal|dallo|dalla|quel|quello|questo|ogni|che|di|a|in|su|da|per|primo|secondo|terzo|ultimo|bel|buon|mio|tuo|suo|nostro|vostro';
const COMANDI = [
  { re: 'nuovo paragrafo|nuovo capoverso|altro paragrafo', segno: '\n\n', primaA: SOLO_SPAZI },
  { re: 'vai a capo|andare a capo|nuova riga|a capo', segno: '\n', primaA: SOLO_SPAZI, escludiDopo: 'di|del|dello|della|dei|degli|delle|a|al|alla' },
  { re: 'punto e virgola', segno: ';' },
  { re: 'punto interrogativo|punto di domanda', segno: '?' },
  { re: 'punto esclamativo', segno: '!' },
  { re: 'puntini di sospensione|tre puntini|puntini puntini', segno: '...' },
  { re: 'due punti', segno: ':', escludiPrima: ARTICOLI + '|i|fatto|segnato|perso|vinto|guadagnato|preso|ho|abbiamo|hanno|sono|con|tra|fra' },
  { re: 'apri parentesi|aperta parentesi', segno: '(', primaA: SPAZI_VIRGOLE },
  { re: 'chiudi parentesi|chiusa parentesi', segno: ')', primaA: SPAZI_VIRGOLE, dopoA: SPAZI_VIRGOLE },
  { re: 'apri virgolette|aperte virgolette', segno: '"<', primaA: SPAZI_VIRGOLE },
  { re: 'chiudi virgolette|chiuse virgolette', segno: '">', primaA: SPAZI_VIRGOLE, dopoA: SPAZI_VIRGOLE },
  { re: 'virgola', segno: ',', escludiPrima: ARTICOLI + '|la|le|una' },
  { re: 'punto a capo', segno: '.\n' },
  {
    re: 'punto',
    segno: '.',
    escludiPrima: ARTICOLI + '|i|a che|fare il|fatto il|tal|tale|quale|qualche|questo|quello|preciso',
    escludiDopo: 'di|del|della|dello|dei|degli|delle|da|in|e basta|debole|forte|fermo|vendita|vendite|croce|nero|morto|cieco|focale|chiave|g',
  },
];

// Esitazioni pure: si tolgono sempre
const SUONI = 'e+h+m+|e+m+|u+h*m+|u+m+|m+h+|h*m{2,}|e+h{2,}|a+h{2,}';
// Riempitivi: si tolgono solo quando stanno fra pause (virgole) o a inizio frase
const RIEMPITIVI = 'cio[eè]|diciamo|tipo|praticamente|insomma|allora|ecco|vabb[eè]|niente|cos[iì]|boh|beh|be|mah|eh|ah|oh|guarda|senti|dunque|come dire|come si dice|in pratica|per cos[iì] dire';

// Autocorrezioni. Forti: valgono sempre. Deboli ("scusa", "volevo dire"): solo se la parte
// dopo riprende una parola di quella prima (es. "a Roma, scusa, a Milano").
const CORREZIONE_FORTE = 'no,? anzi|anzi,? no|no,? scusa|scusa,? no|cio[eè],? volevo dire|no,? volevo dire|scusa,? volevo dire|anzi,? volevo dire|anzi,? meglio|o meglio|correggo';
const CORREZIONE_DEBOLE = 'scusa|scusate|volevo dire|cio[eè]';

// Raddoppi che in italiano si dicono apposta
const RADDOPPI_VOLUTI = new Set([
  'molto', 'tanto', 'piano', 'pian', 'così', 'cosi', 'via', 'poco', 'ciao', 'no', 'sì', 'si', 'su', 'dai', 'forte', 'presto', 'subito', 'adagio', 'bene',
  'ora', 'mai', 'quasi', 'sempre', 'grazie', 'bravo', 'brava', 'zitto', 'buono', 'buona', 'basta', 'ecco', 'qua', 'là', 'là', 'lì', 'tic', 'toc', 'bla',
]);

// Frasi che Whisper inventa sul silenzio o sul rumore (dai sottotitoli con cui e' stato addestrato)
const ALLUCINAZIONI = [
  /sottotitoli (creati|a cura|e revisione|realizzati)/i,
  /amara\.org/i,
  /qtss/i,
  /^grazie (a tutti )?per (la visione|l'attenzione|aver guardato)/i,
  /^(iscriviti|iscrivetevi) al canale/i,
  /^(musica|applausi|risate|silenzio)[.!]?$/i,
  /^(grazie per (l'ascolto|aver ascoltato|averci seguito|la vostra attenzione)|a presto|ci vediamo (al prossimo video|alla prossima))[.!]?$/i,
  /(iscriviti|iscrivetevi|lasciate un like|attivate la campanella)/i,
  /^(sottotitoli|traduzione|revisione) (di|a cura di)\b/i,
  /^\.+$/,
];
// Frasi vere, ma che Whisper inventa spesso sul silenzio: si scartano solo se il modello stesso
// dice che probabilmente non c'era parlato (probSilenzio) o se e' poco sicuro (logprob basso)
const SOSPETTE = [/^(grazie|grazie mille|grazie a tutti|buona visione|alla prossima|ciao a tutti|ciao|buonasera|buongiorno)[.!]?$/i, /^(s[iì]|no|ok|okay)[.!]?$/i];

/** Comandi detti da soli, come segmento intero. */
const COMANDI_SEGMENTO = [
  { re: /^(cancella|elimina|togli) ((l'?)?ultima|la) frase$/, comando: 'cancellaFrase' },
  { re: /^(cancella|elimina|togli) ((l'?)?ultima|la) parola$/, comando: 'cancellaParola' },
  { re: /^(annulla|annulla (l'?ultimo|l'?ultima|tutto quello)( inserimento| frase)?)$/, comando: 'annulla' },
  { re: /^(fine|stop|ferma|basta|termina|chiudi) (la )?dettatura$/, comando: 'stop' },
  { re: /^(smetti di (ascoltare|scrivere)|fine dettato)$/, comando: 'stop' },
];

const minuscoloSemplice = (s) => s.toLocaleLowerCase('it');
const normaComando = (s) =>
  minuscoloSemplice(s)
    .replace(/[’`]/g, "'")
    .replace(/[.,;:!?…"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function eAllucinazione(testo, { probSilenzio = 0, logprob = 0 } = {}) {
  const t = String(testo || '').trim();
  if (!t) return true;
  if (ALLUCINAZIONI.some((r) => r.test(t))) return true;
  return SOSPETTE.some((r) => r.test(t)) && (probSilenzio > 0.3 || logprob < -0.8);
}

export function comandoSegmento(testo) {
  const n = normaComando(testo);
  for (const c of COMANDI_SEGMENTO) if (c.re.test(n)) return c.comando;
  return null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sostituzioni del dizionario: [[detto, scritto], ...], senza badare a maiuscole e punteggiatura in mezzo. */
export function applicaSostituzioni(testo, sostituzioni = []) {
  let t = testo;
  const ordinate = [...sostituzioni].filter((v) => v && v[0] && v[0].trim()).sort((a, b) => b[0].length - a[0].length);
  for (const [detto, scritto] of ordinate) {
    const parti = detto.trim().split(/\s+/).map(escape);
    const re = new RegExp(`${prima}${parti.join('[\\s,]+')}${dopo}`, 'giu');
    t = t.replace(re, () => scritto.trim());
  }
  return t;
}

// segni speciali nel testo durante la pulizia: \u0001<segno>\u0002
const M_A = '\u0001';
const M_C = '\u0002';
// gli a capo dentro i segni diventano ¶, cosi' la divisione in parole non li spezza
const marca = (s) => `${M_A}${s.replace(/\n/g, '¶')}${M_C}`;

function comandiInSegni(t) {
  let out = t;
  for (const c of COMANDI) {
    const esPrima = c.escludiPrima ? `(?<!${prima}(?:${c.escludiPrima})[\\s,]+)` : '';
    const esDopo = c.escludiDopo ? `(?![\\s,]+(?:${c.escludiDopo})${dopo})` : '';
    const re = new RegExp(`${c.primaA || ATTORNO}${esPrima}${prima}(?:${c.re})${dopo}${esDopo}${c.dopoA || ATTORNO}`, 'giu');
    out = out.replace(re, () => ` ${marca(c.segno)} `);
  }
  return out;
}

/** Parole (con la loro punteggiatura attaccata) del testo. */
const pezzi = (t) => t.split(/\s+/).filter(Boolean);
const nuda = (w) => minuscoloSemplice(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
const eNumero = (w) => /^\d/.test(w) || /^(uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|venti|trenta|cento|mille)$/i.test(nuda(w));

function correggiAutocorrezioni(t) {
  let out = t;
  for (let giro = 0; giro < 4; giro++) {
    const reF = new RegExp(`[\\s,]*${prima}(?:${CORREZIONE_FORTE})${dopo}[\\s,]*`, 'iu');
    const reD = new RegExp(`[\\s,]*(?<!~)${prima}(?:${CORREZIONE_DEBOLE})${dopo}[\\s,]*`, 'iu');
    let m = reF.exec(out);
    let forte = true;
    if (!m) {
      m = reD.exec(out);
      forte = false;
    }
    if (!m) break;
    const prima_ = out.slice(0, m.index);
    const dopo_ = out.slice(m.index + m[0].length);
    // inizio della frase in cui sta la correzione: non si torna oltre un segno di fine frase o un comando
    const confine = Math.max(prima_.lastIndexOf('.'), prima_.lastIndexOf('?'), prima_.lastIndexOf('!'), prima_.lastIndexOf(M_C), prima_.lastIndexOf('\n'));
    const testa = prima_.slice(0, confine + 1);
    const frase = pezzi(prima_.slice(confine + 1));
    const nuovo = pezzi(dopo_);
    if (!frase.length || !nuovo.length) {
      if (!forte) {
        // "scusa" a inizio frase: parola normale
        out = prima_ + m[0].replace(new RegExp(`${prima}(?:${CORREZIONE_DEBOLE})${dopo}`, 'iu'), (w) => `${M_A}~${w}${M_C}`) + dopo_;
        continue;
      }
      out = (prima_ + ' ' + dopo_).trim();
      continue;
    }
    const primaNuova = nuda(nuovo[0]);
    // ancora: l'ultima parola uguale alla prima della correzione, nelle ultime 6
    let taglio = -1;
    for (let i = frase.length - 1; i >= Math.max(0, frase.length - 6); i--) {
      if (nuda(frase[i]) === primaNuova) {
        taglio = i;
        break;
      }
    }
    if (taglio < 0 && eNumero(nuovo[0])) {
      for (let i = frase.length - 1; i >= Math.max(0, frase.length - 4); i--) {
        if (eNumero(frase[i])) {
          taglio = i;
          break;
        }
      }
    }
    if (taglio < 0) {
      if (!forte) {
        // "scusa" senza ripresa: parola normale, si lascia com'e' (protetta dal giro dopo)
        out = prima_ + m[0].replace(new RegExp(`${prima}(?:${CORREZIONE_DEBOLE})${dopo}`, 'iu'), (w) => `${M_A}~${w}${M_C}`) + dopo_;
        continue;
      }
      // tante parole quante quelle della correzione (fra 1 e 3), senza superare l'inizio della frase
      taglio = Math.max(0, frase.length - Math.min(3, Math.max(1, nuovo.length > 3 ? 1 : nuovo.length)));
    }
    out = `${testa}${testa && !/\s$/.test(testa) ? ' ' : ''}${[...frase.slice(0, taglio), ...nuovo].join(' ')}`;
  }
  // le parole "scusa" lasciate come normali tornano normali
  return out.replace(new RegExp(`${M_A}~([^${M_C}]*)${M_C}`, 'g'), '$1');
}

function togliEsitazioni(t) {
  // i suoni di esitazione diventano una pausa (\u0006), che per i riempitivi vale come una virgola
  let out = t.replace(new RegExp(`[\\s,]*${prima}(?:${SUONI})${dopo}[\\s,.…]*`, 'giu'), ' \u0006 ');
  const r = `(?:${RIEMPITIVI})`;
  const pausa = '[,\u0006]';
  // fra due pause: via, resta la prima
  out = out.replace(new RegExp(`(${pausa})\\s*${prima}${r}${dopo}\\s*${pausa}`, 'giu'), '$1');
  // a inizio frase seguiti da una pausa, anche piu' d'uno ("allora, diciamo, ...")
  for (let i = 0; i < 3; i++) {
    out = out.replace(new RegExp(`(^[\\s\u0006]*|[.!?${M_C}\\n][\\s\u0006]*)${prima}${r}${dopo}\\s*${pausa}\\s*`, 'giu'), '$1');
  }
  // le pause dei suoni non scrivono niente
  return out.replace(/\s*\u0006\s*/g, ' ');
}

function togliRipetizioni(t) {
  const w = pezzi(t);
  const out = [];
  for (let i = 0; i < w.length; i++) {
    let saltato = false;
    // gruppi di 3, 2 e 1 parola ripetuti subito dopo ("ho fatto ho fatto")
    for (const k of [3, 2, 1]) {
      if (out.length < k || i + k > w.length) continue;
      const a = out.slice(-k).map(nuda);
      const b = w.slice(i, i + k).map(nuda);
      if (a.some((x) => !x) || a.join(' ') !== b.join(' ')) continue;
      if (k === 1 && RADDOPPI_VOLUTI.has(a[0])) continue;
      if (/\d/.test(a.join(''))) continue;
      // punteggiatura sull'ultima copia: si tiene quella
      out.splice(out.length - k, k, ...w.slice(i, i + k));
      i += k - 1;
      saltato = true;
      break;
    }
    if (!saltato) out.push(w[i]);
  }
  return out.join(' ');
}

/** Ricompone testo e segni: spazi giusti attorno alla punteggiatura. */
function componi(t) {
  let out = t.replace(new RegExp(`\\s*${M_A}([^${M_C}]*)${M_C}\\s*`, 'g'), (_, segno) => {
    const s = segno.replace(/¶/g, '\n');
    if (s === '"<') return ' "\u0003';
    if (s === '">') return '"';
    if (s === '(') return ' (\u0003';
    if (s.startsWith('\n') || s.endsWith('\n') || s === '\n\n') return s;
    return s + ' ';
  });
  out = out.replace(/\u0003\s*/g, '');
  // trattini usati come incisi: virgole
  out = out.replace(/\s+[-–—]+\s+/g, ', ');
  // punteggiatura doppia o con lo spazio davanti
  out = out.replace(/[ \t]+([,.;:!?)])/g, '$1');
  out = out.replace(/([,;:])(?:\s*[,;:])+/g, '$1');
  out = out.replace(/,\s*([.!?])/g, '$1');
  out = out.replace(/([.!?])\s*[,.](?!\.)/g, '$1');
  out = out.replace(/([.!?])\s*\./g, '$1');
  out = out.replace(/^[ \t,;:]+/, '');
  out = out.replace(/[ \t]*\n[ \t]*/g, '\n');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out;
}

const ORDINALI = ['primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo'];
const ORDINALI_F = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava', 'nona', 'decima'];
// "secondo me", "secondo il cliente": non e' un elenco
const NON_ORDINALE_DOPO = /^(me|te|lui|lei|noi|voi|loro|il|lo|la|i|gli|le|un|una|uno|quanto|cui|quello|quella|questo|questa|mio|mia|tuo|tua|suo|sua|marco|aldo|kian)\b/i;

/** Maiuscola alla prima lettera. */
const maiuscola = (s) => s.replace(/^(\s*["(«]?)(\p{Ll})/u, (_, a, b) => a + b.toLocaleUpperCase('it'));
// Whisper mette la maiuscola all'inizio di ogni segmento: in mezzo a una frase si toglie, ma
// solo alle parole comuni (un nome proprio resta com'e').
const COMUNI = new Set(
  [
    "il lo la i gli le un uno una l un' del dello della dei degli delle al allo alla ai agli alle dal dalla dai nel nella nei sul sulla sui",
    'di a da in con su per tra fra e ed o od ma che se come quando perché perche mentre dove anche poi quindi però pero oppure né',
    'non più piu già gia ancora sempre mai molto poco tanto troppo così cosi ecco solo proprio forse magari invece inoltre allora dopo prima',
    'io tu lui lei noi voi loro mi ti ci vi si ne me te questo questa questi queste quello quella quelli quelle tutto tutti tutta tutte',
    'mio mia tuo tua suo sua nostro nostra vostro vostra altro altra altri qualche ogni nessuno niente qualcosa',
    "è e' sono ha hanno ho abbiamo avete era erano sarà sara essere avere fare fa fatto va vado andare possiamo può puo devo deve dobbiamo",
    "vorrei voglio serve bisogna c' ci ce oggi domani ieri stasera adesso ora subito qui qua lì li là sì si no",
  ]
    .join(' ')
    .split(' ')
);
const minuscola = (s) =>
  s.replace(/^(\s*["(«]?)(\p{Lu})(\p{Ll}*'?)/u, (x, a, b, c) => (COMUNI.has((b + c).toLocaleLowerCase('it')) || COMUNI.has((b + c).toLocaleLowerCase('it').replace(/'$/, '')) ? a + b.toLocaleLowerCase('it') + c : x));

/** Maiuscole dopo i segni di fine frase e gli a capo. */
function maiuscoleDopoFine(t) {
  return t.replace(/([.!?]\s+|\n\s*|^\s*(?:[-•]|\d+\.)\s+)(["(«]?)(\p{Ll})/gmu, (_, a, b, c) => a + b + c.toLocaleUpperCase('it'));
}

// parole dopo cui la frase non puo' essere finita: il punto messo da Whisper alla pausa va via
const NON_FINALI = new Set(
  'e ed o od ma che di a da in con su per tra fra il lo la i gli le un uno una del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle se quando perché perche come anche mio mia tuo tua suo sua nostro nostra non più molto'.split(' ')
);

/**
 * Sessione di dettatura: pulisce un segmento alla volta tenendo conto di cosa e' gia' stato scritto.
 * @param {object} o { sostituzioni: [[detto, scritto]], automatica: true (punteggiatura messa da Whisper) }
 */
export function creaSessione(o = {}) {
  const st = {
    sospeso: '', // segno di fine frase non ancora scritto (Whisper lo mette a ogni pausa)
    elenco: null, // { tipo: 'puntato' | 'numerato', n }
  };
  const automatica = o.automatica !== false;

  /**
   * @param {string} grezzo testo di Whisper per il segmento
   * @param {object} c { prima: testo gia' presente prima del cursore (ultimi caratteri), pausa: secondi di silenzio prima del segmento }
   * @returns {{ testo: string, comando: string|null }}
   */
  function segmento(grezzo, c = {}) {
    let t = String(grezzo || '')
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (eAllucinazione(t, c)) return { testo: '', comando: null };
    const cmd = comandoSegmento(t);
    if (cmd) {
      if (cmd === 'cancellaFrase' || cmd === 'annulla') st.sospeso = '';
      return { testo: '', comando: cmd };
    }
    t = applicaSostituzioni(t, o.sostituzioni);
    // elenchi a voce
    let apriElenco = null;
    t = t.replace(new RegExp(`${ATTORNO}${prima}(?:elenco puntato|lista puntata|elenco a punti)${dopo}${ATTORNO}`, 'giu'), () => {
      apriElenco = 'puntato';
      return ` ${marca('\u0004')} `;
    });
    t = t.replace(new RegExp(`${ATTORNO}${prima}(?:elenco numerato|lista numerata)${dopo}${ATTORNO}`, 'giu'), () => {
      apriElenco = 'numerato';
      return ` ${marca('\u0004')} `;
    });
    let chiudiElenco = false;
    t = t.replace(new RegExp(`${SOLO_SPAZI}${prima}(?:fine elenco|fine della lista|fine lista|chiudi elenco)${dopo}${ATTORNO}`, 'giu'), () => {
      chiudiElenco = true;
      return ` ${marca('\u0005')} `;
    });
    t = comandiInSegni(t);
    t = correggiAutocorrezioni(t);
    t = togliEsitazioni(t);
    t = togliRipetizioni(t);
    // dopo gli esplicitamente dettati, la punteggiatura automatica di Whisper resta (virgole, punti)
    if (!automatica) t = t.replace(/[,.;:!?](?=\s|$)/g, '');
    t = componi(t);

    // voci dell'elenco: ogni frase un punto. "primo, ...", "secondo, ..." fanno un elenco numerato
    t = t.replace(/\u0004\s*/g, '\u0004');
    const frasi = t.split(/(?<=[.!?])[ \t]+|(?=\u0004)|(?=\u0005)|(?<=\n)/u).filter((x) => x !== '');
    let uscita = '';
    for (let f of frasi) {
      if (f.startsWith('\u0004')) {
        st.elenco = { tipo: apriElenco || 'puntato', n: 0 };
        f = f.slice(1).trim();
        if (!f) continue;
      }
      if (f.startsWith('\u0005')) {
        st.elenco = null;
        uscita += '\n';
        f = f.slice(1).trim();
        if (!f) continue;
      }
      // "Primo, ...": l'ordinale seguito da una virgola o dai due punti
      const m = /^\s*(\p{L}+)\s*[,:]\s*(.*)$/su.exec(f);
      const w = m ? minuscoloSemplice(m[1]) : '';
      let k = ORDINALI.indexOf(w);
      if (k < 0) k = ORDINALI_F.indexOf(w);
      const resto = m ? m[2] : '';
      const ordinale = k >= 0 && resto && !NON_ORDINALE_DOPO.test(resto) && (k === 0 || (st.elenco && st.elenco.tipo === 'numerato'));
      if (ordinale) {
        if (!st.elenco || st.elenco.tipo !== 'numerato') st.elenco = { tipo: 'numerato', n: 0 };
        st.elenco.n = k + 1;
        uscita += `\n${st.elenco.n}. ${maiuscola(resto.trim())}`;
        continue;
      }
      if (st.elenco && f.trim() && !/^\n/.test(f)) {
        if (st.elenco.tipo === 'puntato') uscita += `\n- ${maiuscola(f.trim())}`;
        else {
          st.elenco.n += 1;
          uscita += `\n${st.elenco.n}. ${maiuscola(f.trim())}`;
        }
        continue;
      }
      if (/^\n/.test(f) && st.elenco && f.trim() === '') {
        // "a capo" dentro un elenco: chiude l'elenco
        st.elenco = null;
      }
      uscita += (uscita && !/[\s\n]$/.test(uscita) && !/^[\s\n,.;:!?)]/.test(f) ? ' ' : '') + f;
    }
    t = uscita.replace(/[ \t]+\n/g, '\n');
    if (!t.trim()) return { testo: '', comando: null };

    // fine frase messo da Whisper alla pausa: resta in sospeso fino al prossimo segmento
    let sospeso = '';
    const fine = /([.!?])$/.exec(t);
    if (fine && automatica) {
      sospeso = fine[1];
      t = t.slice(0, -1);
    }
    const ultima = nuda(pezzi(t).slice(-1)[0] || '');
    if (sospeso === '.' && NON_FINALI.has(ultima)) sospeso = '';

    // contesto: cosa c'e' prima del cursore (testo del campo + sospeso della sessione)
    const pre = String(c.prima ?? '');
    let attacco = '';
    let nuovaFrase;
    if (st.sospeso) {
      // pausa breve e niente maiuscola obbligata: era solo una pausa, la frase continua
      const continua = st.sospeso === '.' && (c.pausa ?? 99) < 1.0 && !/^\n/.test(t);
      if (continua) nuovaFrase = false;
      else {
        attacco = st.sospeso;
        nuovaFrase = true;
      }
    } else {
      const p = pre.replace(/[ \t]+$/, '');
      nuovaFrase = !p || /[.!?\n]$/.test(p) || /[.!?]["»)]$/.test(p) || /^\s*$/.test(p);
    }
    st.sospeso = sospeso;
    if (/^\n/.test(t)) nuovaFrase = true;
    // a inizio campo (o di riga) gli a capo in testa non servono
    if (!attacco && (!pre.trim() || /\n[ \t]*$/.test(pre))) t = t.replace(/^\n+/, '');
    t = maiuscoleDopoFine(t);
    if (nuovaFrase) t = maiuscola(t);
    else t = minuscola(t);
    // spazio davanti, se serve
    const finePre = (attacco || pre).slice(-1);
    const serveSpazio = (attacco || pre) && !/[\s(\n"«]/.test(finePre) && !/^[\s,.;:!?)\n]/.test(t);
    return { testo: attacco + (serveSpazio ? ' ' : '') + t, attacco, comando: null };
  }

  /** Fine dettatura: il segno di fine frase rimasto in sospeso. */
  function chiudi() {
    const s = st.sospeso;
    st.sospeso = '';
    st.elenco = null;
    return s;
  }

  return { segmento, chiudi, stato: st };
}

/** Indice da cui comincia l'ultima frase di `t` (per "cancella l'ultima frase"). */
export function inizioUltimaFrase(t) {
  const s = t.replace(/\s+$/, '');
  const corpo = s.replace(/[.!?]+["»)]?$/, '');
  let i = -1;
  const re = /[.!?]["»)]?\s+|\n/g;
  let m;
  while ((m = re.exec(corpo))) i = m.index + m[0].length;
  return i < 0 ? 0 : i;
}

/** Indice da cui comincia l'ultima parola di `t`. */
export function inizioUltimaParola(t) {
  const s = t.replace(/[\s.,;:!?]+$/, '');
  const m = /\S+$/.exec(s);
  return m ? m.index : 0;
}
