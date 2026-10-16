// Ripetizioni vicine per "Rileggi la bozza": la stessa parola, o la stessa radice, usata di nuovo
// entro poche frasi. Niente grammatica ne' stile. Script semplice (non modulo) che registra le
// sue funzioni in globalThis.webgRipetizioni. Si importa nel service worker, che fa l'elenco del
// pannello e manda alla pagina solo le parole da colorare, e nei test. Nella pagina non entra.
(() => {
  // parole che si ripetono per forza e non contano: articoli, preposizioni, congiunzioni,
  // pronomi, ausiliari e verbi di servizio, avverbi e quantificatori comuni
  const FUNZIONE = new Set(
    (
      'il lo la i gli le un uno una un\' di a da in con su per tra fra del dello della dei degli delle al allo alla ai agli alle ' +
      'dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi ' +
      'e ed o od ma pero però anche come quando mentre perche perché poiche poiché quindi dunque oppure ovvero cioe cioè ' +
      'se che chi cui non ne né piu più meno molto molta molti molte poco poca pochi poche tanto tanta tanti tante ' +
      'tutto tutta tutti tutte ogni ciascuno qualche alcuni alcune altro altra altri altre stesso stessa stessi stesse ' +
      'questo questa questi queste quello quella quelli quelle quel quei ciò io tu lui lei noi voi loro mi ti si ci vi ' +
      'me te se sé suo sua suoi sue mio mia miei mie tuo tua tuoi tue nostro nostra nostri nostre vostro vostra loro ' +
      'essere sono sei è siamo siete era erano stato stata stati state sarà saranno sarebbe sia siano fosse fossero ' +
      'avere ho hai ha abbiamo avete hanno aveva avevano avuto avrà avrebbe abbia ' +
      'fare fa fanno fatto può possono potere deve devono dovere vuole vogliono volere stare sta stanno ' +
      'già ancora sempre mai poi ora qui qua lì là dove così solo proprio anzi invece inoltre circa ' +
      'the and for with that this from have are was were will would there their'
    ).split(/\s+/)
  );

  // Stemmer leggero per l'italiano: minuscole, senza accenti, via i suffissi piu' comuni.
  const SUFFISSI = ['amente', 'mente', 'azioni', 'azione', 'zioni', 'zione', 'menti', 'mento', 'ando', 'endo',
    'ando', 'are', 'ere', 'ire', 'ato', 'ata', 'ati', 'ate', 'ito', 'ita', 'iti', 'ite', 'uto', 'uta', 'uti', 'ute',
    'ismo', 'ista', 'isti', 'iste', 'oso', 'osa', 'osi', 'ose'];
  // Una radice corta unisce parole diverse (porta/portare, parte/partita, venti/vento,
  // banco/banca, pesca/pescare): sotto le 5 lettere conta solo la stessa parola. I suffissi degli
  // aggettivi (-ale, -ico) non si tolgono: capitale e capito non hanno niente in comune.
  const RADICE_MIN = 5;
  function radice(parola) {
    let p = parola.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const intera = p;
    for (const s of SUFFISSI) {
      if (p.length - s.length >= 4 && p.endsWith(s)) {
        p = p.slice(0, -s.length);
        break;
      }
    }
    if (p.length >= 5) p = p.replace(/[aeiou]+$/, '');
    return p.length >= RADICE_MIN ? p : intera;
  }

  /**
   * Parole di un testo con la frase a cui appartengono e la posizione nel testo.
   * Una frase finisce con . ! ? … o con un a capo.
   */
  function parole(testo) {
    const out = [];
    let frase = 0;
    const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*|[.!?…]+|\n/gu;
    let m;
    while ((m = re.exec(testo))) {
      const t = m[0];
      if (t === '\n' || /^[.!?…]+$/u.test(t)) {
        frase++;
        continue;
      }
      // l'articolo eliso non fa parte della parola: "l'albero" conta come "albero"
      const el = /^(?:[\p{L}]{1,3})['’](?=[\p{L}])/u.exec(t);
      const inizio = m.index + (el ? el[0].length : 0);
      const parola = el ? t.slice(el[0].length) : t;
      out.push({ parola, frase, inizio, fine: inizio + parola.length });
    }
    return out;
  }

  /**
   * Ripetizioni vicine: gruppi di parole con la stessa radice, entro `finestra` frasi l'una
   * dall'altra. Restituisce [{ radice, parole: [forme], volte, posizioni: [{inizio, fine, parola}] }],
   * dalle piu' frequenti. Solo parole di almeno `minimo` lettere e non funzione.
   */
  function trova(testo, { finestra = 3, minimo = 4 } = {}) {
    const lista = parole(testo).filter((p) => p.parola.length >= minimo && /\p{L}/u.test(p.parola) && !FUNZIONE.has(p.parola.toLowerCase()));
    const gruppi = new Map();
    for (const p of lista) {
      const r = radice(p.parola);
      if (r.length < 3) continue;
      if (!gruppi.has(r)) gruppi.set(r, []);
      gruppi.get(r).push(p);
    }
    const out = [];
    for (const [r, occ] of gruppi) {
      if (occ.length < 2) continue;
      // tengo le occorrenze che hanno un'altra occorrenza vicina
      const vicine = occ.filter((p, i) => occ.some((q, j) => j !== i && Math.abs(q.frase - p.frase) < finestra));
      if (vicine.length < 2) continue;
      out.push({
        radice: r,
        parole: [...new Set(vicine.map((p) => p.parola.toLowerCase()))],
        volte: vicine.length,
        posizioni: vicine.map(({ inizio, fine, parola }) => ({ inizio, fine, parola })),
      });
    }
    return out.sort((a, b) => b.volte - a.volte || a.posizioni[0].inizio - b.posizioni[0].inizio);
  }

  globalThis.webgRipetizioni = { trova, radice, parole, FUNZIONE };
})();
