// Dettatura, lato pagina (content script iniettato con Ctrl+Spazio, solo nella scheda dove si detta).
// Due ruoli, anche nello stesso frame:
//  - indicatore (frame principale): pallino discreto in basso a destra mentre si ascolta, con il
//    pulsante per fermare; diventa una casella con "Copia" e "Inserisci" dove non si puo' scrivere
//    direttamente (Google Docs, nessun campo selezionato);
//  - campo (frame con il campo attivo): pulizia italiana del testo (pulizia-pagina.js) e
//    inserimento nel campo, con annulla dell'ultimo inserimento.
// Inserimento: input e textarea con execCommand('insertText') (tiene il Ctrl+Z del campo e avvisa
// React e simili) o, se non va, con il setter nativo del valore piu' l'evento input; campi
// modificabili (Gmail, Claude.ai, WhatsApp Web) con execCommand('insertText'), che passa da
// beforeinput come la tastiera.
(() => {
  if (globalThis.webgDettatura) return;
  const P = globalThis.webgPulizia;
  const D = (globalThis.webgDettatura = { attiva: false });

  // ---------- campo ----------
  let campo = null; // elemento dove si scrive
  let ultimoCampo = null; // ultimo campo dove si e' cliccato (per "Inserisci" dalla casella)
  document.addEventListener(
    'focusin',
    () => {
      const el = attivoProfondo();
      if (scrivibile(el)) ultimoCampo = el;
    },
    true
  );
  let sessione = null; // sessione di pulizia (lib/pulizia.js)
  const inseriti = []; // { el, testo } per "annulla"

  function attivoProfondo() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
  const eTesto = (el) =>
    el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/i.test(el.type || ''))) && !el.readOnly && !el.disabled;
  const eModificabile = (el) => el && el.isContentEditable;
  const scrivibile = (el) => eTesto(el) || eModificabile(el);
  // Google Docs disegna il testo su un canvas: lì si usa la casella
  const eGoogleDocs = () => location.hostname === 'docs.google.com' && /\/(document|presentation|spreadsheets)\//.test(location.pathname);

  /** Testo prima del cursore (ultimi 300 caratteri), per maiuscole e spazi. */
  function primaDelCursore(el) {
    try {
      if (eTesto(el)) return el.value.slice(Math.max(0, (el.selectionStart ?? el.value.length) - 300), el.selectionStart ?? el.value.length);
      const sel = el.ownerDocument.getSelection();
      if (!sel || !sel.rangeCount) return '';
      const r = sel.getRangeAt(0).cloneRange();
      const tutto = el.ownerDocument.createRange();
      tutto.selectNodeContents(el);
      tutto.setEnd(r.startContainer, r.startOffset);
      const t = tutto.toString();
      // gli a capo fra blocchi (div, p) non stanno nel toString: cursore a inizio di un blocco
      // che non e' il primo = si comincia una riga nuova
      const nodo = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      const blocco = nodo && nodo.closest('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre');
      if (t && blocco && blocco !== el && el.contains(blocco)) {
        const daBlocco = el.ownerDocument.createRange();
        daBlocco.selectNodeContents(blocco);
        daBlocco.setEnd(r.startContainer, r.startOffset);
        if (daBlocco.toString() === '' && !t.endsWith('\n')) return (t + '\n').slice(-300);
      }
      return t.slice(-300);
    } catch {
      return '';
    }
  }

  function valoreNativo(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }

  /** Inserisce `testo` al cursore. Restituisce il metodo usato o null se non ci e' riuscito. */
  async function inserisci(el, testo) {
    if (!testo) return 'niente';
    if (el.ownerDocument.activeElement !== el && !(el.getRootNode && el.getRootNode().activeElement === el)) el.focus();
    if (eTesto(el)) {
      const prima = el.value;
      const a = el.selectionStart ?? prima.length;
      const b = el.selectionEnd ?? a;
      let ok = false;
      try {
        ok = el.ownerDocument.execCommand('insertText', false, testo);
      } catch {}
      if (ok && el.value === prima.slice(0, a) + testo + prima.slice(b)) return 'execCommand';
      // setter nativo (React tiene il suo: con quello nativo vede il cambio) piu' l'evento input
      if (el.value !== prima) valoreNativo(el, prima);
      valoreNativo(el, prima.slice(0, a) + testo + prima.slice(b));
      el.setSelectionRange(a + testo.length, a + testo.length);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: testo }));
      return el.value.includes(testo) ? 'setter' : null;
    }
    if (eModificabile(el)) {
      const doc = el.ownerDocument;
      const prima = el.textContent;
      const nudo = testo.replace(/\s+/g, '');
      const riuscito = () => {
        const dopo = el.textContent;
        if (!nudo) return true;
        return dopo !== prima && dopo.replace(/\s+/g, '').includes(nudo.slice(-Math.min(20, nudo.length)));
      };
      let ok = true;
      let gestiti = 0;
      for (const p of testo.split(/(\n+)/)) {
        if (!p) continue;
        // un a capo = riga nuova (come Maiusc+Invio: nelle chat non invia); due o piu' = paragrafo nuovo
        const tipo = p[0] === '\n' ? (p.length > 1 ? 'insertParagraph' : 'insertLineBreak') : 'insertText';
        // prima un beforeinput, come fa la tastiera: gli editor che tengono il testo per conto loro
        // (ProseMirror, Lexical, Slate) lo prendono e lo fermano; altrimenti scrive execCommand
        const ev = new InputEvent('beforeinput', { inputType: tipo, data: tipo === 'insertText' ? p : null, bubbles: true, cancelable: true, composed: true });
        if (!el.dispatchEvent(ev)) {
          gestiti++;
          continue;
        }
        ok = doc.execCommand(tipo, false, tipo === 'insertText' ? p : undefined) && ok;
      }
      // l'editor che ha preso il beforeinput puo' aggiornare la pagina un attimo dopo
      if (gestiti) await new Promise((r) => setTimeout(r, 40));
      if (riuscito()) return gestiti ? 'beforeinput' : 'execCommand';
      if (gestiti && el.textContent === prima) {
        // l'editor ha fermato l'evento ma non ha scritto niente (ignora gli eventi sintetici): execCommand
        for (const p of testo.split(/(\n+)/)) {
          if (!p) continue;
          if (p[0] === '\n') doc.execCommand(p.length > 1 ? 'insertParagraph' : 'insertLineBreak', false);
          else doc.execCommand('insertText', false, p);
        }
        if (riuscito()) return 'execCommand';
      }
      return el.textContent !== prima && ok ? 'parziale' : null;
    }
    return null;
  }

  /** Toglie dal campo, prima del cursore, il testo `t` se c'e' ancora. */
  function togliPrimaDelCursore(el, t) {
    if (!t) return false;
    if (eTesto(el)) {
      const a = el.selectionStart ?? el.value.length;
      if (el.value.slice(a - t.length, a) !== t) return false;
      el.focus();
      el.setSelectionRange(a - t.length, a);
      let ok = false;
      try {
        ok = el.ownerDocument.execCommand('delete', false);
      } catch {}
      if (!ok || el.value.slice(a - t.length, a) === t) {
        const v = el.value;
        valoreNativo(el, v.slice(0, a - t.length) + v.slice(a));
        el.setSelectionRange(a - t.length, a - t.length);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
      return true;
    }
    if (eModificabile(el)) {
      const sel = el.ownerDocument.getSelection();
      if (!sel || !sel.rangeCount) return false;
      // tanti caratteri indietro quanti quelli inseriti (gli a capo contano uno)
      for (let i = 0; i < t.length; i++) sel.modify('extend', 'backward', 'character');
      return el.ownerDocument.execCommand('delete', false);
    }
    return false;
  }

  /** "Cancella l'ultima frase" / "l'ultima parola": dal cursore indietro. */
  function cancellaIndietro(el, unita) {
    if (eTesto(el)) {
      const a = el.selectionStart ?? el.value.length;
      const prima = el.value.slice(0, a);
      const da = unita === 'parola' ? P.inizioUltimaParola(prima) : P.inizioUltimaFrase(prima);
      el.focus();
      el.setSelectionRange(da, a);
      try {
        if (el.ownerDocument.execCommand('delete', false)) return true;
      } catch {}
      valoreNativo(el, el.value.slice(0, da) + el.value.slice(a));
      el.setSelectionRange(da, da);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      return true;
    }
    if (eModificabile(el)) {
      const sel = el.ownerDocument.getSelection();
      if (!sel || !sel.rangeCount) return false;
      // spazi in fondo, poi la frase (o la parola) intera
      sel.modify('extend', 'backward', unita === 'parola' ? 'word' : 'sentence');
      if (sel.isCollapsed) sel.modify('extend', 'backward', 'character');
      return el.ownerDocument.execCommand('delete', false);
    }
    return false;
  }

  function preparaCampo() {
    const el = attivoProfondo();
    campo = scrivibile(el) && !eGoogleDocs() ? el : null;
    sessione = P.creaSessione({ sostituzioni: D.sostituzioni || [], automatica: D.automatica !== false });
    return !!campo;
  }

  /** Un segmento dettato: pulizia, poi inserimento (o casella). */
  async function dettato(m) {
    if (!sessione) preparaCampo();
    const el = campo && campo.isConnected ? campo : null;
    const prima = el ? primaDelCursore(el) : D.casellaTesto || '';
    const r = sessione.segmento(m.testo, { prima, pausa: m.pausa, probSilenzio: m.probSilenzio, logprob: m.logprob });
    if (r.comando) return comando(r.comando, el);
    if (!r.testo) return { ok: true, vuoto: true };
    if (el) {
      const metodo = await inserisci(el, r.testo);
      if (metodo) {
        // per "annulla": si toglie il pezzo dettato, non il punto della frase prima (attacco)
        inseriti.push({ el, testo: r.testo.slice((r.attacco || '').length) });
        if (inseriti.length > 50) inseriti.shift();
        return { ok: true, metodo, testo: r.testo };
      }
    }
    return { ok: true, casella: r.testo };
  }

  function comando(c, el) {
    if (c === 'stop') return { ok: true, stop: true };
    if (!el) return { ok: true, comandoCasella: c };
    if (c === 'annulla') {
      const u = inseriti.pop();
      return { ok: true, comando: c, fatto: !!(u && togliPrimaDelCursore(u.el, u.testo)) };
    }
    if (c === 'cancellaFrase' || c === 'cancellaParola') {
      inseriti.length = 0;
      return { ok: true, comando: c, fatto: cancellaIndietro(el, c === 'cancellaParola' ? 'parola' : 'frase') };
    }
    return { ok: true };
  }

  async function chiudiSessione() {
    let coda = '';
    if (sessione) coda = sessione.chiudi();
    sessione = null;
    if (coda && campo && campo.isConnected) {
      const pre = primaDelCursore(campo);
      // il punto finale solo se il testo dettato non finisce gia' con un segno
      if (!/[.!?;:,]\s*$/.test(pre)) await inserisci(campo, coda);
      return { coda: '' };
    }
    return { coda };
  }

  // ---------- indicatore (frame principale) ----------
  let host = null;
  let ombra = null;
  let tempoChiusura = null;

  const CSS = `
    :host { all: initial; }
    .pillola { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 10px;
      font: 600 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d2433; background: #fff; border: 2px solid #c0392b;
      border-radius: 999px; padding: 8px 10px 8px 16px; box-shadow: 0 6px 24px rgba(0,0,0,.22); max-width: min(560px, calc(100vw - 32px)); }
    .preparazione.pillola, .trascrivo.pillola { border-color: #23417b; }
    .errore.pillola { border-color: #d86f22; }
    .pallino { width: 12px; height: 12px; border-radius: 50%; background: #c0392b; flex: none; }
    .livello { display: inline-flex; align-items: flex-end; gap: 2px; height: 18px; flex: none; }
    .livello i { width: 4px; height: 3px; border-radius: 2px; background: #c0392b; transition: height .08s linear; }
    .preparazione .livello, .errore .livello, .inattiva .livello { display: none; }
    .ascolto .pallino { animation: respiro 1.6s ease-in-out infinite; }
    .parlato .pallino { background: #e74c3c; transform: scale(1.25); box-shadow: 0 0 0 4px rgba(231,76,60,.22); }
    .trascrivo .pallino, .preparazione .pallino { background: #23417b; animation: respiro .8s ease-in-out infinite; }
    .errore .pallino { background: #d86f22; animation: none; }
    @keyframes respiro { 50% { opacity: .35; } }
    .testo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button { font: inherit; border: 1px solid #c9cfda; background: #f4f6f9; color: inherit; border-radius: 999px; padding: 3px 10px; cursor: pointer; }
    button:hover { background: #e9edf3; }
    .casella { position: fixed; right: 16px; top: 70px; z-index: 2147483647; width: min(420px, calc(100vw - 32px)); background: #fff; color: #1d2433;
      border: 1px solid #d5dae3; border-radius: 12px; box-shadow: 0 6px 22px rgba(0,0,0,.16); padding: 10px; font: 13px/1.4 system-ui, sans-serif; }
    .casella textarea { width: 100%; box-sizing: border-box; min-height: 90px; font: 14px/1.45 system-ui, sans-serif; border: 1px solid #d5dae3; border-radius: 8px; padding: 6px 8px; resize: vertical; color: inherit; background: #fff; }
    .casella .azioni { display: flex; gap: 6px; justify-content: flex-end; margin-top: 6px; }
    .casella p { margin: 0 0 6px; color: #4a5468; }
    @media (prefers-color-scheme: dark) {
      .pillola, .casella { background: #1f2430; color: #e7eaf0; border-color: #3a4152; }
      .casella textarea { background: #161a22; border-color: #3a4152; }
      button { background: #2a3040; border-color: #3f475a; }
      button:hover { background: #343b4e; }
      .casella p { color: #aab2c2; }
    }
    @media (prefers-reduced-motion: reduce) { .pallino { animation: none !important; } }`;

  function creaIndicatore() {
    if (host && host.isConnected) return;
    host = document.createElement('webg-dettatura');
    ombra = host.attachShadow({ mode: 'closed' });
    ombra.innerHTML = `<style>${CSS}</style>
      <div class="casella" hidden role="dialog" aria-label="Testo dettato">
        <p class="spiega"></p>
        <textarea spellcheck="true"></textarea>
        <div class="azioni"><button class="svuota">Svuota</button><button class="copia">Copia</button><button class="inserisci">Inserisci nel campo</button></div>
      </div>
      <div class="pillola preparazione" role="status" aria-live="polite">
        <span class="pallino" aria-hidden="true"></span><span class="testo">Preparo il microfono…</span>
        <span class="livello" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        <button class="ferma" title="Ferma la dettatura">Ferma</button>
      </div>`;
    (document.body || document.documentElement).appendChild(host);
    ombra.querySelector('.ferma').addEventListener('click', () => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaFerma' }).catch(() => {}));
    const area = ombra.querySelector('textarea');
    area.addEventListener('input', () => (D.casellaTesto = area.value));
    ombra.querySelector('.copia').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(area.value);
      } catch {
        area.select();
        document.execCommand('copy');
      }
      ombra.querySelector('.spiega').textContent = 'Copiato: incollalo dove vuoi con Ctrl+V.';
    });
    ombra.querySelector('.svuota').addEventListener('click', () => {
      area.value = '';
      D.casellaTesto = '';
    });
    ombra.querySelector('.inserisci').addEventListener('click', async () => {
      const t = area.value;
      const el = campo && campo.isConnected ? campo : ultimoCampo && ultimoCampo.isConnected ? ultimoCampo : null;
      if (el && (await inserisci(el, t))) {
        area.value = '';
        D.casellaTesto = '';
        ombra.querySelector('.casella').hidden = true;
      } else ombra.querySelector('.spiega').textContent = 'Qui non riesco a scrivere direttamente: premi Copia e incolla con Ctrl+V.';
    });
  }

  const TESTI = {
    preparazione: 'Preparo il microfono…',
    ascolto: 'Ti ascolto',
    parlato: 'Ti ascolto',
    trascrivo: 'Scrivo…',
    inattiva: 'Dettatura finita',
  };

  function aggiornaIndicatore(s) {
    creaIndicatore();
    const p = ombra.querySelector('.pillola');
    const fase = s.fase === 'ascolto' && s.inCoda > 0 ? 'trascrivo' : s.fase;
    p.className = `pillola ${fase}`;
    let t = TESTI[fase] || '';
    if (s.fase === 'preparazione' && s.download && s.download.totale) t = `Scarico il modello: ${Math.floor((100 * s.download.scaricati) / s.download.totale)}%`;
    if (s.fase === 'errore') t = s.errore || 'Errore nella dettatura';
    if ((fase === 'ascolto' || fase === 'parlato') && D.scorciatoia) t += ` · ${D.scorciatoia} per finire`;
    p.querySelector('.testo').textContent = t;
    p.title = t;
    clearTimeout(tempoChiusura);
    if (s.fase === 'inattiva' || s.fase === 'errore') {
      p.querySelector('.ferma').hidden = true;
      // la casella resta finche' c'e' testo da copiare
      tempoChiusura = setTimeout(() => {
        if (!ombra.querySelector('.casella').hidden && D.casellaTesto) p.hidden = true;
        else togliIndicatore();
      }, s.fase === 'errore' ? 8000 : 1500);
    } else {
      p.hidden = false;
      p.querySelector('.ferma').hidden = false;
    }
  }

  function mostraCasella(testo, spiega) {
    creaIndicatore();
    const c = ombra.querySelector('.casella');
    const area = c.querySelector('textarea');
    if (testo) {
      const pre = area.value;
      area.value = pre + testo;
      D.casellaTesto = area.value;
      area.scrollTop = area.scrollHeight;
    }
    c.querySelector('.spiega').textContent =
      spiega || (eGoogleDocs() ? 'In Google Docs non posso scrivere direttamente: il testo arriva qui, poi Copia e incolla.' : 'Nessun campo dove scrivere: il testo arriva qui. Clicca in un campo e premi Inserisci, oppure Copia.');
    c.hidden = false;
  }

  function togliIndicatore() {
    if (host) host.remove();
    host = ombra = null;
  }

  // premi per parlare: il rilascio di Ctrl o Spazio (o la perdita del fuoco) va al service worker,
  // che decide se era un tocco breve (mani libere) o un tasto tenuto (fine della dettatura)
  let rilascioMandato = false;
  const rilascia = () => {
    if (!D.attiva || rilascioMandato) return;
    rilascioMandato = true;
    chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaRilascio' }).catch(() => {});
  };
  window.addEventListener('keyup', (e) => (e.key === 'Control' || e.code === 'Space' || e.key === ' ') && rilascia(), true);
  window.addEventListener('blur', rilascia, true);

  chrome.runtime.onMessage.addListener((m, mittente, rispondi) => {
    if (!m || typeof m.dett !== 'string') return;
    switch (m.dett) {
      case 'avvia':
        D.attiva = true;
        rilascioMandato = false;
        D.sostituzioni = Array.isArray(m.sostituzioni) ? m.sostituzioni : [];
        D.automatica = m.automatica !== false;
        D.scorciatoia = m.scorciatoia || '';
        inseriti.length = 0;
        if (m.campo) preparaCampo();
        if (m.indicatore) {
          creaIndicatore();
          aggiornaIndicatore({ fase: 'preparazione' });
          if (m.casella) mostraCasella('', m.casella === true ? undefined : m.casella);
        }
        rispondi({ ok: true, campo: !!campo });
        return;
      case 'livello':
        // livello del microfono (0..1): cinque barrette
        if (ombra) {
          const v = Math.max(0, Math.min(1, Number(m.v) || 0));
          ombra.querySelectorAll('.livello i').forEach((b, k) => (b.style.height = `${3 + Math.max(0, Math.min(1, v * 5 - k)) * 15}px`));
        }
        rispondi({ ok: true });
        return;
      case 'stato':
        if (host || D.attiva) aggiornaIndicatore(m.stato);
        rispondi({ ok: true });
        return;
      case 'testo':
        dettato(m).then(rispondi, (e) => rispondi({ ok: false, errore: String(e && e.message) }));
        return true;
      case 'casella':
        mostraCasella(m.testo, m.spiega);
        rispondi({ ok: true });
        return;
      case 'fine':
        D.attiva = false;
        chiudiSessione().then((r) => {
          if (r.coda && host && !ombra.querySelector('.casella').hidden) mostraCasella(r.coda);
          rispondi({ ok: true, ...r });
        });
        return true;
    }
  });
})();
