// Estrae l'articolo della pagina: titolo e testo, senza menu, pubblicita',
// commenti, banner dei cookie e pie' di pagina. Si inietta solo quando l'utente
// lo chiede (activeTab + scripting), subito dopo vendor/readability/Readability.js
// (Mozilla Readability, Apache-2.0), nel frame principale della scheda.
// Il valore dell'ultima espressione e' il risultato che riceve il service worker:
//   { titolo, testo, parole, lingua, ms }  oppure  { nessuno: true, parole, motivo }
/* global Readability */
(() => {
  const t0 = performance.now();
  const MIN_PAROLE = 50;
  const contaParole = (s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length;

  // Sezioni finali che non fanno parte dell'articolo: qui ci si ferma.
  const FINE =
    /^(note|note e riferimenti|bibliografia|collegamenti esterni|link esterni|voci correlate|altri progetti|riferimenti|fonti|approfondimenti|letture consigliate|articoli correlati|potrebbe interessarti|ti potrebbe interessare|leggi anche|commenti|lascia un commento|lascia una risposta|condividi|references|external links|see also|further reading|notes|related articles|related posts|comments|leave a comment|share this)\s*[:.]?$/i;

  // Rumore che Readability a volte lascia: banner dei cookie, avvisi, note di Wikipedia
  const RUMORE = [
    'script', 'style', 'noscript', 'template',
    '[hidden]', '[role="dialog"]', '[role="alertdialog"]',
    'sup.reference', '.mw-editsection', '.noprint', '.navbox', '.metadata', '.mw-jump-link', '#toc', '.toc', '.reflist', '.references',
    '#cookie-law-info-bar', '#onetrust-consent-sdk', '#CybotCookiebotDialog', '#didomi-host', '#iubenda-cs-banner', '.iubenda-cs-container',
    '.cc-window', '.cookie-banner', '.cookie-notice', '#cookie-notice', '.qc-cmp2-container', '#usercentrics-root',
  ].join(',');
  const SOSPETTO = /(^|[\s_-])(cookie|consent|gdpr|newsletter-?(popup|modal)|paywall|banner-?adv|advert|sponsor)([\s_-]|$)/i;

  // Testo da non leggere anche se resta dentro l'articolo
  const SALTA = new Set(['FIGURE', 'FIGCAPTION', 'PICTURE', 'IMG', 'SVG', 'MATH', 'VIDEO', 'AUDIO', 'IFRAME', 'PRE',
    'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'NAV', 'ASIDE', 'FOOTER', 'SCRIPT', 'STYLE', 'NOSCRIPT']);
  // tabelle di dati (intestazioni o tre colonne e piu'): lette ad alta voce non si capiscono.
  // Le tabelle usate per impaginare i siti vecchi restano.
  const tabellaDati = (t) => !!t.querySelector('th, caption') || ((t.rows && t.rows[0] && t.rows[0].cells.length) || 0) >= 3;
  const BLOCCO = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL',
    'BLOCKQUOTE', 'DD', 'DT', 'DL', 'BR', 'HR', 'TR', 'ADDRESS', 'DETAILS', 'SUMMARY']);
  const TITOLO = /^H[1-6]$/;

  function pulisci(doc) {
    for (const el of doc.querySelectorAll(RUMORE)) el.remove();
    for (const el of doc.querySelectorAll('[id],[class]')) {
      const firma = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`;
      // solo contenitori piccoli: una classe "sponsor" su <body> non deve svuotare la pagina
      if (SOSPETTO.test(firma) && el !== doc.body && el !== doc.documentElement && (el.textContent || '').length < 3000) el.remove();
    }
  }

  /** Testo del contenuto di Readability: un paragrafo per riga, ci si ferma alle sezioni finali. */
  function righe(radice) {
    const out = [];
    let riga = '';
    let fermo = false;
    let lette = 0;
    const a_capo = () => {
      const r = riga.replace(/\s+/g, ' ').trim();
      if (r) {
        out.push(r);
        lette += r.length;
      }
      riga = '';
    };
    const giro = (n) => {
      if (fermo) return;
      if (n.nodeType === 3) {
        riga += n.data;
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (SALTA.has(tag) || (tag === 'TABLE' && tabellaDati(n))) return;
      if (TITOLO.test(tag)) {
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (lette > 300 && FINE.test(t)) {
          fermo = true;
          return;
        }
      }
      const blocco = BLOCCO.has(tag);
      if (blocco) a_capo();
      for (const c of n.childNodes) giro(c);
      if (blocco) a_capo();
    };
    giro(radice);
    a_capo();
    return out;
  }

  // note fra parentesi quadre: [1], [12], [a], [citazione necessaria], [senza fonte], [modifica | modifica wikitesto]
  const NOTE = /\s*\[(?:\d{1,3}|[a-z]|nota \d+|citazione necessaria|senza fonte|chiarimento necessario|modifica[^\]]{0,40}|edit|citation needed)\]/gi;
  const ripulisciRiga = (r) => r.replace(NOTE, '').replace(/\s+([,.;:!?])/g, '$1').trim();

  // Righe di servizio da non leggere: lettori audio del sito, diritti, durate, inviti a condividere
  const SERVIZIO =
    /^(?:ascolta(?: l'articolo| la notizia| questo articolo)?|condividi(?: su \w+)?|leggi anche|leggi l'articolo|tempo di lettura[^.]{0,30}|pubblicit[aà]|advertisement|\d{1,2}:\d{2}(?::\d{2})?|(?:©|\(c\)|copyright|riproduzione riservata)[^.]{0,60}|[^.]{0,40}(?:riproduzione riservata|all rights reserved)[^.]{0,40})\.?$/i;

  /** Titolo senza il nome del sito: l'H1 della pagina se il titolo lo contiene, altrimenti tolgo la coda " - Sito". */
  function titoloPulito(grezzo, sito) {
    const t = String(grezzo || '').replace(/\s+/g, ' ').trim();
    const confronta = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const h1 = [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim()).filter((h) => h.length >= 8);
    const uguale = h1.find((h) => confronta(t).startsWith(confronta(h)) && confronta(h).length >= confronta(t).length * 0.4);
    if (uguale) return uguale;
    const host = location.hostname.replace(/^www\./, '').split('.')[0];
    const parti = t.split(/\s+[-|–—·:»]\s+/);
    while (parti.length > 1) {
      const coda = confronta(parti[parti.length - 1]);
      const eSito = (sito && confronta(sito).includes(coda)) || coda.includes(confronta(host)) || /^(wikipedia|notizie|news|home|blog)$/.test(coda);
      if (!eSito || coda.length > 40) break;
      parti.pop();
    }
    return parti.join(' - ') || t;
  }

  try {
    if (typeof Readability !== 'function') return { nessuno: true, motivo: 'readability' };
    const copia = document.cloneNode(true);
    pulisci(copia);
    const art = new Readability(copia, { charThreshold: 300 }).parse();
    if (!art || !art.content) return { nessuno: true, parole: 0, motivo: 'vuoto' };
    const box = new DOMParser().parseFromString(art.content, 'text/html').body;
    let corpo = righe(box)
      .map(ripulisciRiga)
      .filter((r) => /[\p{L}\p{N}]/u.test(r) && !SERVIZIO.test(r));
    // via le righe ripetute (didascalie e "condividi" duplicati)
    corpo = corpo.filter((r, i) => r.length > 80 || corpo.indexOf(r) === i);
    const parole = contaParole(corpo.join(' '));
    if (parole < MIN_PAROLE) return { nessuno: true, parole, motivo: 'corto' };
    let titolo = titoloPulito(art.title || document.title || '', art.siteName);
    const confronta = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (titolo && corpo.length && confronta(corpo[0]) === confronta(titolo)) corpo.shift();
    // una riga vuota fra i paragrafi: titoli, voci di elenco e citazioni restano separati
    // anche quando non finiscono con un punto (paragrafi() unirebbe le righe di un testo a capo)
    const testo = (titolo ? [titolo, ...corpo] : corpo).join('\n\n');
    return {
      titolo: titolo || null,
      testo,
      parole: contaParole(testo),
      lingua: art.lang || document.documentElement.lang || '',
      ms: Math.round(performance.now() - t0),
    };
  } catch (e) {
    return { nessuno: true, motivo: String((e && e.message) || e) };
  }
})();
