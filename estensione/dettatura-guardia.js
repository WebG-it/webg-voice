// Guardia della pagina della dettatura (script classico, caricato prima di dettatura.js): se lo
// script principale non parte entro 6 secondi, la pagina lo dice invece di restare ferma.
setTimeout(() => {
  if (globalThis.dettaturaPaginaPronta) return;
  const p = document.getElementById('micStato');
  const m = document.getElementById('modelloStato');
  const testo = 'La pagina non è partita. Ricarica la pagina; se resta così, disattiva e riattiva WebG Voice in chrome://extensions e segnala il problema a info@webg.it.';
  if (p && /Controllo/.test(p.textContent)) p.textContent = testo;
  if (m && !m.textContent) m.textContent = testo;
}, 6000);
