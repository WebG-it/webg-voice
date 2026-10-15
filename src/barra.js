// Barretta flottante nella pagina durante la lettura: pausa/riprendi, stop, velocita'.
// Iniettata su richiesta (activeTab + scripting); una sola istanza per pagina.
(() => {
  if (window.__leggiAdAltaVoceBarra) {
    window.__leggiAdAltaVoceBarra.mostra();
    return;
  }

  const host = document.createElement('div');
  host.setAttribute('data-leggi-ad-alta-voce', '');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
<style>
  :host { all: initial; }
  .barra {
    --sfondo: #ffffff; --testo: #1d1d1f; --tenue: #6e6e73; --bordo: rgba(0,0,0,.12);
    --tasto: #f2f2f4; --tasto-su: #e6e6ea; --accento: #d86f22;
    display: flex; align-items: center; gap: 6px;
    font: 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--testo); background: var(--sfondo);
    border: 1px solid var(--bordo); border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,.16);
    padding: 6px 8px; user-select: none;
    opacity: 0; transform: translateY(8px); transition: opacity .18s, transform .18s;
  }
  .barra.visibile { opacity: 1; transform: none; }
  @media (prefers-color-scheme: dark) {
    .barra { --sfondo: #242426; --testo: #f2f2f4; --tenue: #a1a1a6; --bordo: rgba(255,255,255,.14);
             --tasto: #333336; --tasto-su: #3d3d41; --accento: #f0954f; }
  }
  button {
    all: unset; box-sizing: border-box; cursor: pointer;
    width: 30px; height: 30px; border-radius: 8px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--tasto); color: var(--testo);
  }
  button:hover { background: var(--tasto-su); }
  button:focus-visible { outline: 2px solid var(--accento); outline-offset: 1px; }
  button:disabled { opacity: .4; cursor: default; }
  svg { width: 16px; height: 16px; fill: currentColor; }
  .vel { display: inline-flex; align-items: center; gap: 2px; }
  .vel button { width: 24px; height: 24px; font-size: 15px; font-weight: 600; }
  .vel output { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }
  .stato { color: var(--tenue); max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
  .punto { width: 8px; height: 8px; border-radius: 50%; background: var(--accento); flex: none; margin-left: 2px; }
  .punto.fermo { background: var(--tenue); }
  .riquadro {
    --sfondo: #ffffff; --testo: #1d1d1f; --tenue: #6e6e73; --bordo: rgba(0,0,0,.12);
    --tasto: #f2f2f4; --tasto-su: #e6e6ea; --accento: #23417b; --accento-testo: #ffffff;
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--testo); background: var(--sfondo);
    border: 1px solid var(--bordo); border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.16);
    padding: 10px 12px; margin-bottom: 8px; width: 300px; box-sizing: border-box;
  }
  @media (prefers-color-scheme: dark) {
    .riquadro { --sfondo: #242426; --testo: #f2f2f4; --tenue: #a1a1a6; --bordo: rgba(255,255,255,.14);
                --tasto: #333336; --tasto-su: #3d3d41; --accento: #8fb0ea; --accento-testo: #0f1d38; }
  }
  .riquadro[hidden], .riquadro [hidden], button[hidden] { display: none !important; }
  .riquadro p { margin: 0 0 8px; }
  .riquadro .azioni { display: flex; gap: 8px; justify-content: flex-end; }
  .riquadro .azioni button { width: auto; height: 28px; padding: 0 12px; font: 600 12.5px system-ui, sans-serif; }
  .riquadro .azioni button.primario { background: var(--accento); color: var(--accento-testo); }
  .avanz { height: 6px; border-radius: 3px; background: var(--tasto); overflow: hidden; margin: 2px 0 6px; }
  .avanz > i { display: block; height: 100%; width: 0; background: var(--accento); transition: width .2s; }
  .mb { color: var(--tenue); font-variant-numeric: tabular-nums; font-size: 12px; }
</style>
<div class="riquadro" hidden>
  <p class="msg"></p>
  <div class="avanz" hidden><i></i></div>
  <div class="mb" hidden></div>
  <div class="azioni">
    <button class="no">Annulla</button>
    <button class="si primario">Scarica</button>
  </div>
</div>
<div class="barra" role="toolbar" aria-label="Lettura ad alta voce">
  <span class="punto" aria-hidden="true"></span>
  <span class="stato" aria-live="polite">Preparo la voce…</span>
  <button class="pp" title="Pausa" aria-label="Pausa"></button>
  <button class="stop" title="Ferma" aria-label="Ferma">
    <svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>
  </button>
  <span class="vel" title="Velocità">
    <button class="meno" aria-label="Più lento">−</button>
    <output aria-label="Velocità">1,00×</output>
    <button class="piu" aria-label="Più veloce">+</button>
  </span>
</div>`;

  const $ = (s) => root.querySelector(s);
  const barra = $('.barra');
  const pp = $('.pp');
  const statoEl = $('.stato');
  const punto = $('.punto');
  const velEl = $('output');
  const ICONA_PAUSA = '<svg viewBox="0 0 16 16"><rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/></svg>';
  const ICONA_PLAY = '<svg viewBox="0 0 16 16"><path d="M5 3.2v9.6c0 .6.6.9 1.1.6l7.4-4.8c.5-.3.5-.9 0-1.2L6.1 2.6C5.6 2.3 5 2.6 5 3.2z"/></svg>';
  pp.innerHTML = ICONA_PAUSA;
  const riquadro = $('.riquadro');
  const msgEl = $('.riquadro .msg');
  const avanz = $('.avanz');
  const barraAv = $('.avanz > i');
  const mbEl = $('.mb');
  const siEl = $('.si');
  const noEl = $('.no');
  siEl.addEventListener('click', () => comando('consenti'));
  noEl.addEventListener('click', () => comando(fase === 'consenso' ? 'rifiuta' : 'stop'));
  const MB = (b) => Math.round(b / 1e6);

  function aggiornaRiquadro(s) {
    const d = s.download;
    let mostra = false;
    avanz.hidden = mbEl.hidden = true;
    siEl.hidden = noEl.hidden = true;
    if (s.fase === 'consenso') {
      mostra = true;
      const gia = d && d.scaricati ? ` Ne hai già ${MB(d.scaricati)} MB: riprende da lì.` : '';
      msgEl.textContent = `Sei su una connessione a consumo: per leggere serve scaricare la voce, circa ${MB(d ? d.totale : 330e6)} MB, una volta sola.${gia}`;
      siEl.textContent = 'Scarica';
      siEl.hidden = noEl.hidden = false;
    } else if (d && d.totale && !d.interrotto && d.scaricati < d.totale && !d.inAttesa) {
      mostra = true;
      msgEl.textContent = d.riprovoTra
        ? `Connessione interrotta: riprovo da solo fra ${d.riprovoTra} secondi.`
        : d.riprovo
          ? `Connessione instabile, riprovo (${d.riprovo})…`
          : 'Scarico il modello vocale, una volta sola: la lettura parte appena è pronto.';
      avanz.hidden = mbEl.hidden = false;
      barraAv.style.width = `${(100 * d.scaricati) / d.totale}%`;
      mbEl.textContent = `${Math.floor((100 * d.scaricati) / d.totale)}% · ${MB(d.scaricati)} di ${MB(d.totale)} MB`;
      noEl.textContent = 'Annulla';
    } else if (d && d.interrotto) {
      mostra = true;
      msgEl.textContent = s.errore;
      avanz.hidden = mbEl.hidden = false;
      barraAv.style.width = `${(100 * d.scaricati) / d.totale}%`;
      mbEl.textContent = `${MB(d.scaricati)} di ${MB(d.totale)} MB`;
      siEl.textContent = 'Riprova';
      siEl.hidden = noEl.hidden = false;
      noEl.textContent = 'Chiudi';
    }
    riquadro.hidden = !mostra;
    return mostra;
  }

  let velocita = 1;
  let fase = 'preparazione';
  let nascondi = null;

  const comando = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra }).catch(() => {});
  const fmt = (v) => `${v.toFixed(2).replace('.', ',')}×`;

  pp.addEventListener('click', () => comando(fase === 'pausa' ? 'riprendi' : 'pausa'));
  $('.stop').addEventListener('click', () => comando('stop'));
  const cambia = (d) => {
    velocita = Math.round(Math.min(1.5, Math.max(0.7, velocita + d)) * 100) / 100;
    velEl.textContent = fmt(velocita);
    comando('velocita', { valore: velocita });
  };
  $('.meno').addEventListener('click', () => cambia(-0.1));
  $('.piu').addEventListener('click', () => cambia(0.1));

  function testoStato(s) {
    if (s.fase === 'consenso') return 'In attesa di conferma';
    if (s.download && s.download.interrotto) return 'Download interrotto';
    if (s.errore) return s.errore;
    if (s.download && s.download.file === 'modello' && s.download.totale) {
      return `Scarico la voce: ${Math.floor((s.download.scaricati / s.download.totale) * 100)}%`;
    }
    if (s.download && s.download.totale && !s.download.inAttesa && !s.download.interrotto) {
      return `Scarico la voce: ${Math.floor((s.download.scaricati / s.download.totale) * 100)}%`;
    }
    if (s.download && s.download.avvio) return 'Avvio il motore…';
    if (s.downloadVoce && s.downloadVoce.totale) return `Scarico la voce: ${Math.floor((s.downloadVoce.scaricati / s.downloadVoce.totale) * 100)}%`;
    if (s.fase === 'preparazione') return 'Preparo la voce…';
    if (s.fase === 'pausa') return 'In pausa';
    if (s.fase === 'lettura') return s.totale > 1 ? `In lettura · ${Math.min(s.blocco + 1, s.totale)} di ${s.totale}` : 'In lettura';
    return 'Lettura finita';
  }

  function aggiorna(s) {
    fase = s.fase;
    velocita = s.velocita;
    velEl.textContent = fmt(velocita);
    statoEl.textContent = testoStato(s);
    const conRiquadro = aggiornaRiquadro(s);
    const attivo = s.fase === 'lettura' || s.fase === 'pausa' || s.fase === 'preparazione';
    pp.innerHTML = s.fase === 'pausa' ? ICONA_PLAY : ICONA_PAUSA;
    pp.title = s.fase === 'pausa' ? 'Riprendi' : 'Pausa';
    pp.setAttribute('aria-label', pp.title);
    pp.disabled = !attivo;
    punto.classList.toggle('fermo', s.fase !== 'lettura');
    clearTimeout(nascondi);
    if (!attivo && !conRiquadro && s.fase !== 'consenso') nascondi = setTimeout(rimuovi, s.errore ? 6000 : 1500);
  }

  function mostra() {
    clearTimeout(nascondi);
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    requestAnimationFrame(() => barra.classList.add('visibile'));
  }

  function rimuovi() {
    if (window.__leggiAdAltaVoceBarra && window.__leggiAdAltaVoceBarra.evid) window.__leggiAdAltaVoceBarra.evid.pulisci();
    barra.classList.remove('visibile');
    setTimeout(() => {
      if (!barra.classList.contains('visibile')) host.remove();
    }, 200);
  }

  chrome.runtime.onMessage.addListener((msg, mittente) => {
    if (mittente.id !== chrome.runtime.id) return;
    if (msg && msg.da === 'offscreen' && msg.tipo === 'stato') {
      const s = msg.stato;
      if ((s.fase !== 'inattivo' || s.errore) && !host.isConnected) mostra();
      if (host.isConnected) aggiorna(s);
    }
  });

  // ---- Evidenziazione della frase in lettura e delle ripetizioni (CSS Custom Highlight API) ----
  // Non tocca il DOM della pagina: gli intervalli si registrano in CSS.highlights e lo stile
  // arriva da un foglio costruito in JavaScript. Dove non si puo' (testo in una textarea, in un
  // riquadro o in un editor) le parole non si trovano e non succede niente.
  const evid = (() => {
    const ok = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';
    let foglio = null;
    let indice = null; // [{ w, nodo, inizio, fine }]
    let cursore = 0;
    let attivo = true;
    // Scheda nascosta (l'utente fa altro mentre ascolta): la lettura continua, ma evidenziazione e
    // scorrimento si fermano. Si tiene solo l'ultima frase arrivata; quando la scheda torna
    // visibile si evidenzia quella, cioe' la frase che si sta ascoltando.
    let sospesa = null;
    // testo letto da un'area di testo, da un campo o da un riquadro: non sta nei nodi della pagina,
    // e la stessa frase scritta altrove non va evidenziata al suo posto
    const fuoriPagina = () => {
      const ae = document.activeElement;
      return !!ae && ['TEXTAREA', 'INPUT', 'IFRAME', 'FRAME'].includes(ae.tagName);
    };
    let ultimoScorrimentoUtente = 0;
    const nota = () => {
      ultimoScorrimentoUtente = Date.now();
    };
    for (const ev of ['wheel', 'touchstart', 'touchmove']) window.addEventListener(ev, nota, { passive: true, capture: true });
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) nota();
    }, { capture: true });

    const norma = (w) => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    function stile() {
      if (foglio) return;
      try {
        foglio = new CSSStyleSheet();
        foglio.replaceSync(
          '::highlight(webg-voice-lettura){background-color:rgba(255,213,79,.55);color:inherit}' +
            '::highlight(webg-voice-ripetizioni){background-color:rgba(239,108,108,.35);text-decoration:underline wavy rgba(198,40,40,.9)}'
        );
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, foglio];
      } catch {
        foglio = null;
      }
    }
    function togliStile() {
      if (!foglio || CSS.highlights.has('webg-voice-lettura') || CSS.highlights.has('webg-voice-ripetizioni')) return;
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((f) => f !== foglio);
      foglio = null;
    }
    // parole dei nodi di testo visibili della pagina (non script, stili, campi, la barretta)
    function costruisci() {
      const out = [];
      const radice = document.body || document.documentElement;
      const w = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || p.closest('script,style,noscript,template,textarea,input,select,[data-leggi-ad-alta-voce]')) return NodeFilter.FILTER_REJECT;
          return /[\p{L}\p{N}]/u.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const re = /[\p{L}\p{N}]+/gu;
        let m;
        while ((m = re.exec(n.data))) out.push({ w: norma(m[0]), nodo: n, inizio: m.index, fine: m.index + m[0].length });
      }
      return out;
    }
    // inizio della selezione nella pagina, se c'e': la lettura parte da li'
    function partenza() {
      const sel = getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return 0;
      const r = sel.getRangeAt(0);
      for (let i = 0; i < indice.length; i++) {
        try {
          if (r.comparePoint(indice[i].nodo, indice[i].fine) >= 0) return i;
        } catch {}
      }
      return 0;
    }
    // Trova nella pagina le parole del blocco, dal cursore in avanti (con un piccolo margine
    // indietro). Fra i candidati sceglie quello che copre piu' parole del blocco: una frase
    // ripetuta in un riquadro laterale o in un menu, spesso troncata, perde contro quella
    // dell'articolo. Le parole che non si trovano (numeri scritti in lettere, sigle sciolte)
    // si saltano; una corrispondenza sparpagliata su troppe parole della pagina si scarta.
    function cerca(testo) {
      const bw = (testo.match(/[\p{L}\p{N}]+/gu) || []).map(norma).filter((w) => w.length >= 2);
      if (!bw.length) return null;
      const da = Math.max(0, cursore - 30);
      const fino = Math.min(indice.length, cursore + 6000);
      let migliore = null;
      let limite = fino;
      for (let s = da; s < limite; s++) {
        const w = indice[s].w;
        for (let k = 0; k < Math.min(8, bw.length); k++) {
          // ancora: la prima parola del blocco, o una delle successive se non e' troppo corta
          if (w !== bw[k] || (k > 0 && bw[k].length < 4)) continue;
          let p = s;
          const presi = [s];
          for (let j = k + 1; j < bw.length; j++) {
            for (let x = p + 1; x <= Math.min(indice.length - 1, p + 6); x++) {
              if (indice[x].w === bw[j]) {
                p = x;
                presi.push(x);
                break;
              }
            }
          }
          // via le parole isolate agli estremi (una data nella riga dell'autore, una parola di una
          // nota prima del testo): l'evidenziazione comincia e finisce dove le parole sono fitte
          while (presi.length > 3 && presi[1] - presi[0] > 3) presi.shift();
          while (presi.length > 3 && presi[presi.length - 1] - presi[presi.length - 2] > 3) presi.pop();
          const trovate = presi.length;
          const inizio = presi[0];
          const ultimo = presi[presi.length - 1];
          const attese = bw.length - k;
          if (trovate < Math.min(3, attese)) continue;
          if (ultimo - inizio + 1 > attese * 1.6 + 6) continue; // troppo sparpagliata
          const copertura = trovate / bw.length;
          const densita = trovate / (ultimo - inizio + 1);
          // vince chi copre piu' parole del blocco; a pari copertura, chi le ha piu' fitte
          // (una nota prima del testo che finisce con le stesse parole perde)
          const meglio = !migliore || copertura > migliore.copertura + 0.02 || (copertura >= migliore.copertura - 0.02 && densita > migliore.densita + 0.01);
          if (meglio) migliore = { s: inizio, ultimo, copertura, densita };
          break;
        }
        // trovata una buona: si guarda ancora un poco piu' avanti se ce n'e' una piu' fitta
        if (migliore && migliore.copertura >= 0.9 && limite === fino) limite = Math.min(fino, s + 60);
      }
      return migliore && migliore.copertura >= 0.5 ? [migliore.s, migliore.ultimo] : null;
    }
    function scorri(range) {
      if (Date.now() - ultimoScorrimentoUtente < 5000) return; // l'utente sta scorrendo da se'
      const r = range.getBoundingClientRect();
      if (!r.height) return;
      if (r.top >= 60 && r.bottom <= innerHeight - 90) return;
      const el = range.startContainer.parentElement;
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (sospesa) {
        const s = sospesa;
        sospesa = null;
        api.frase(s.testo, s.nuova, s.articolo);
      }
      // i messaggi arrivati mentre Chrome teneva ferma la scheda si possono perdere: si chiede
      // all'offscreen la frase che si sta ascoltando adesso
      if (host.isConnected && (fase === 'lettura' || fase === 'pausa')) comando('riallinea');
    });
    const api = {
      frase(testo, nuova, articolo) {
        // @@test-inizio
        const reg = JSON.parse(document.documentElement.dataset.webgChiamate || '[]');
        reg.push([nuova, (testo || '').slice(0, 25)]);
        document.documentElement.dataset.webgChiamate = JSON.stringify(reg.slice(-12));
        // @@test-fine
        if (!ok) return;
        if (document.hidden && testo) {
          sospesa = { testo, nuova: !!(nuova || (sospesa && sospesa.nuova)), articolo };
          return;
        }
        sospesa = null;
        try {
          if (!testo) {
            // fine lettura (l'offscreen manda il testo vuoto solo alla fine): pulizia completa
            indice = null;
            cursore = 0;
            CSS.highlights.delete('webg-voice-lettura');
            togliStile();
            return;
          }
          if (nuova || !indice) {
            // l'articolo sta sempre nella pagina, anche se un banner o un riquadro ha il fuoco
            attivo = articolo || !fuoriPagina();
            indice = attivo ? costruisci() : [];
            cursore = attivo ? partenza() : 0;
            // @@test-inizio
            document.documentElement.dataset.webgProva = JSON.stringify({ fuoco: document.activeElement && document.activeElement.tagName, attivo, cursore, parole: indice.length });
            // @@test-fine
          }
          if (!attivo) return;
          const t = cerca(testo);
          if (!t) return;
          const [a, b] = t;
          const range = new Range();
          range.setStart(indice[a].nodo, indice[a].inizio);
          range.setEnd(indice[b].nodo, indice[b].fine);
          stile();
          CSS.highlights.set('webg-voice-lettura', new Highlight(range));
          cursore = b + 1;
          scorri(range);
        } catch {}
      },
      ripetizioni(parole) {
        if (!ok) return;
        try {
          CSS.highlights.delete('webg-voice-ripetizioni');
          if (!parole || !parole.length) return togliStile();
          // solo dentro una selezione vera della pagina (il testo che si sta rileggendo): non se il
          // testo viene da un'area di testo, da un campo o da un riquadro
          const sel = getSelection();
          const r = sel && sel.rangeCount && !sel.isCollapsed && !fuoriPagina() ? sel.getRangeAt(0) : null;
          if (!r) return;
          const voglio = new Set(parole.map(norma));
          const tutte = costruisci();
          const ranges = [];
          for (const x of tutte) {
            if (!voglio.has(x.w)) continue;
            if (!r.intersectsNode(x.nodo)) continue;
            const rr = new Range();
            rr.setStart(x.nodo, x.inizio);
            rr.setEnd(x.nodo, x.fine);
            ranges.push(rr);
          }
          if (!ranges.length) return;
          stile();
          CSS.highlights.set('webg-voice-ripetizioni', new Highlight(...ranges));
        } catch {}
      },
      // fine lettura: via l'evidenziazione, l'indice delle parole (la pagina puo' cambiare prima
      // della prossima lettura) e il foglio di stile, se non serve piu' alle ripetizioni
      pulisci() {
        sospesa = null;
        indice = null;
        cursore = 0;
        if (!ok) return;
        try {
          CSS.highlights.delete('webg-voice-lettura');
          togliStile();
        } catch {}
      },
    };
    return api;
  })();
  chrome.runtime.onMessage.addListener((msg, mittente) => {
    if (mittente.id !== chrome.runtime.id || !msg) return;
    if (msg.da === 'offscreen' && msg.tipo === 'evidenzia') evid.frase(typeof msg.testo === 'string' ? msg.testo : null, !!msg.nuova, !!msg.articolo);
    if (msg.da === 'background' && msg.tipo === 'ripetizioni' && Array.isArray(msg.parole)) evid.ripetizioni(msg.parole.filter((p) => typeof p === 'string'));
  });

  window.__leggiAdAltaVoceBarra = { mostra, evid };
  mostra();
})();
