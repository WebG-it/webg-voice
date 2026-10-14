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

  window.__leggiAdAltaVoceBarra = { mostra };
  mostra();
})();
