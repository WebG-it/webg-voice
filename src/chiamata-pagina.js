// Barretta della trascrizione di una call, dentro la scheda catturata: dice che si sta trascrivendo
// (e' dentro la pagina: se condividi tutto lo schermo, gli altri la vedono), mostra che le due fonti ascoltano, ricorda di avvisare i partecipanti e ferma/salva con un clic.
// Script classico iniettato dal service worker (activeTab): nessun accesso al contenuto della pagina.

(() => {
  if (globalThis.webgChiamataPagina) return;
  const MESSAGGIO_PARTECIPANTI =
    'Ti avviso che sto trascrivendo questa call per i miei appunti: ne ricavo un testo scritto, salvato sul mio computer. L\'audio non lo conservo né lo mando a nessuno. Se preferisci che non lo faccia, dimmelo e mi fermo.';

  let host = null;
  let radice = null;
  let el = {};
  let timer = null;
  let inizio = Date.now();
  let ridotta = false;
  let promemoriaFinoA = 0;
  let ultimoSegnale = Date.now();
  let ascoltatore = null;

  const due = (n) => String(n).padStart(2, '0');
  const durata = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    return `${h ? `${h}:` : ''}${due(Math.floor((s % 3600) / 60))}:${due(s % 60)}`;
  };

  function crea() {
    host = document.createElement('div');
    // @@test-inizio
    host.setAttribute('data-webg-voice', 'chiamata');
    // @@test-fine
    host.style.cssText = 'all:initial;position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;';
    radice = host.attachShadow({ mode: 'closed' });
    radice.innerHTML = `
<style>
  :host{all:initial}
  .b{font:13px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:oklch(0.99 0.004 27);background:oklch(0.45 0.16 27);border:1px solid oklch(0.38 0.14 27);border-radius:14px;box-shadow:0 1px 2px oklch(0 0 0/.15),0 10px 30px oklch(0.25 0.08 27/.35);padding:8px 12px;display:flex;flex-direction:column;gap:6px;max-width:min(94vw,780px)}
  .r{display:flex;align-items:center;gap:10px}.r strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.r>*:not(strong){flex:none}
  .pt{width:10px;height:10px;border-radius:50%;background:#fff;animation:l 1.4s infinite}
  @keyframes l{50%{opacity:.25}}
  .liv{display:inline-flex;align-items:center;gap:4px;font-size:11px;opacity:.95}
  .liv i{display:inline-block;width:34px;height:6px;background:#fff3;border-radius:3px;overflow:hidden}
  .liv i b{display:block;height:100%;width:0;background:#fff;transition:width .2s}
  button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:8px;padding:4px 10px;background:oklch(0.99 0.004 27);color:oklch(0.42 0.16 27)}button:focus-visible{outline:2px solid oklch(0.99 0.004 27);outline-offset:2px}
  button.n{background:oklch(1 0 0/.18);color:oklch(0.99 0.004 27)}
  .p{background:oklch(0 0 0/.18);border-radius:9px;padding:7px 9px}
  .p p{margin:0 0 5px}
  [hidden]{display:none!important}
  .mini{width:14px;height:14px;border-radius:50%;background:oklch(0.52 0.175 27);border:2px solid #fff;box-shadow:0 1px 6px #0007;cursor:pointer;animation:l 1.4s infinite}
</style>
<div class="mini" hidden title="WebG Voice sta trascrivendo la call: clic per riaprire"></div>
<div class="b">
  <div class="r">
    <span class="pt"></span>
    <strong>WebG Voice trascrive questa call sul tuo computer</strong>
    <span class="t">00:00</span>
    <span class="liv">Call <i><b data-f="Call"></b></i></span>
    <span class="liv io">Io <i><b data-f="Io"></b></i></span>
    <button class="s" title="Chiude la trascrizione e salva il file .md nei download">Ferma e salva</button>
    <button class="n m" title="Riduci" aria-label="Riduci">–</button>
  </div>
  <div class="p">
    <p>Avvisa i partecipanti che stai trascrivendo: loro non vedono questa barretta.</p>
    <button class="c">Copia un messaggio per la chat</button> <button class="n x">Ok, avvisati</button>
  </div>
  <div class="e" hidden></div>
</div>`;
    el = {
      barra: radice.querySelector('.b'),
      mini: radice.querySelector('.mini'),
      t: radice.querySelector('.t'),
      io: radice.querySelector('.io'),
      promemoria: radice.querySelector('.p'),
      errore: radice.querySelector('.e'),
      ferma: radice.querySelector('.s'),
      copia: radice.querySelector('.c'),
      ok: radice.querySelector('.x'),
      riduci: radice.querySelector('.m'),
    };
    el.ferma.addEventListener('click', async () => {
      el.ferma.disabled = true;
      el.ferma.textContent = 'Salvo…';
      let ok = false;
      try {
        const r = await chrome.runtime.sendMessage({ a: 'background', tipo: 'chiamataFerma' });
        ok = !!r && r.ok !== false;
      } catch {}
      // se non risponde nessuno (estensione aggiornata o spenta) il pulsante torna disponibile
      setTimeout(() => {
        if (host && !ok) {
          el.ferma.disabled = false;
          el.ferma.textContent = 'Ferma e salva';
        }
      }, 3000);
    });
    el.copia.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(MESSAGGIO_PARTECIPANTI);
        el.copia.textContent = 'Copiato: incollalo nella chat';
      } catch {
        el.copia.textContent = 'Non riesco a copiare';
      }
    });
    el.ok.addEventListener('click', () => {
      promemoriaFinoA = 0;
      el.promemoria.hidden = true;
    });
    el.riduci.addEventListener('click', () => {
      ridotta = true;
      mostra();
    });
    el.mini.addEventListener('click', () => {
      ridotta = false;
      mostra();
    });
    (document.documentElement || document.body).appendChild(host);
    mostra();
  }

  function mostra() {
    el.barra.hidden = ridotta;
    el.mini.hidden = !ridotta;
    el.promemoria.hidden = !promemoriaFinoA || Date.now() > promemoriaFinoA;
  }

  function aggiorna() {
    el.t.textContent = durata(Date.now() - inizio);
    // i livelli arrivano 4 volte al secondo: se tacciono da 10 secondi la trascrizione e' ferma o l'estensione non risponde
    if (Date.now() - ultimoSegnale > 10000) {
      el.errore.textContent = 'La trascrizione sembra interrotta: se continua così, premi Ferma e salva e controlla il file.';
      el.errore.hidden = false;
    }
    if (promemoriaFinoA && Date.now() > promemoriaFinoA) {
      promemoriaFinoA = 0;
      mostra();
    }
  }

  function applicaStato(s) {
    if (!s) return;
    if (s.inizio) inizio = s.inizio;
    el.io.hidden = !!(s.senzaMicrofono || s.microfonoPerso);
    let avviso = '';
    if (s.senzaMicrofono) avviso = 'Il microfono non è disponibile: trascrivo solo l\'audio della call.';
    else if (s.microfonoPerso) avviso = 'Il microfono si è scollegato: continuo con la sola call.';
    else if (s.codaSec > 60) avviso = 'Il computer è occupato: la trascrizione è in ritardo.';
    if (s.lacune) avviso = `${avviso ? `${avviso} ` : ''}Alcuni tratti non sono stati trascritti.`;
    if (s.fase === 'errore' && s.errore) avviso = `Errore: ${s.errore}`;
    el.errore.textContent = avviso;
    el.errore.hidden = !avviso;
  }

  function livelli(liv) {
    ultimoSegnale = Date.now();
    for (const b of radice.querySelectorAll('[data-f]')) b.style.width = `${Math.round(100 * (liv[b.dataset.f] || 0))}%`;
  }

  function chiudi() {
    clearInterval(timer);
    if (ascoltatore) chrome.runtime.onMessage.removeListener(ascoltatore);
    ascoltatore = null;
    if (host) host.remove();
    host = null;
    globalThis.webgChiamataPagina = undefined;
  }

  ascoltatore = (m) => {
    if (!m || typeof m.chiam !== 'string') return;
    if (m.chiam === 'avvia') {
      if (!host) {
        crea();
        promemoriaFinoA = Date.now() + 25000;
        mostra();
        timer = setInterval(aggiorna, 1000);
      }
      applicaStato(m.stato);
    } else if (m.chiam === 'stato') {
      if (host) applicaStato(m.stato);
    } else if (m.chiam === 'livello') {
      if (host && m.liv) livelli(m.liv);
    } else if (m.chiam === 'fine') chiudi();
  };
  chrome.runtime.onMessage.addListener(ascoltatore);
  globalThis.webgChiamataPagina = { chiudi };
})();
