// Trascrizione di una call, lato service worker: permessi facoltativi, flusso audio della scheda
// (tabCapture), ponte con l'offscreen document (chiamata.js) e con la scheda (chiamata-pagina.js),
// segno visibile (icona e barretta) e salvataggio del file .md nei download.
// Una trascrizione alla volta, legata alla scheda dove e' partita.

import { PERMESSI_CHIAMATA } from './chiamata-permessi.js';
import { creaTrascrizione, markdown, nomeFileChiamata } from './lib/chiamata-testo.js';
const PAGINA_BARRETTA = 'chiamata-pagina.js';
const CARTELLA = 'WebG Voice';

let C = null; // { tabId, titolo, host, inizio } anche in storage.session (il service worker puo' ripartire)
async function chiam() {
  if (C) return C;
  const { chiamata } = await chrome.storage.session.get('chiamata');
  C = chiamata || null;
  return C;
}
async function salva(v) {
  C = v;
  if (v) await chrome.storage.session.set({ chiamata: v });
  else await chrome.storage.session.remove('chiamata');
}

/** Sito della scheda, senza percorso: l'indirizzo completo puo' contenere il codice della stanza. */
export function sitoDi(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host : '';
  } catch {
    return '';
  }
}

export const permessiConcessi = async () => {
  try {
    return await chrome.permissions.contains({ permissions: PERMESSI_CHIAMATA });
  } catch {
    return false;
  }
};

/**
 * @param {object} c { aOffscreen, assicuraOffscreen, apriMicrofono, fermaLettura, fermaDettatura }
 */
export function creaChiamata(c) {
  let ultimoStato = null;
  let codaAzioni = Promise.resolve();
  const schedeConBadge = new Set(); // schede dove l'icona mostra CALL: alla fine si puliscono tutte

  async function attiva() {
    const s = await chiam();
    if (!s) return false;
    if (!(await chrome.offscreen.hasDocument())) {
      await salva(null);
      return false;
    }
    try {
      const r = await c.aOffscreen({ tipo: 'chiamStato' });
      // appena partita (il motore sta ancora aprendo i flussi) non si dichiara finita
      if (!r.attiva && Date.now() - s.inizio < 20000) return true;
      if (!r.attiva) await salva(null);
      return !!r.attiva;
    } catch {
      return false;
    }
  }

  async function badge(tabId, testo) {
    if (testo) schedeConBadge.add(tabId);
    try {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c0392b' });
      await chrome.action.setBadgeText({ tabId, text: testo });
      if (testo) await chrome.action.setTitle({ tabId, title: 'WebG Voice: sto trascrivendo la call sul tuo computer' });
      else await chrome.action.setTitle({ tabId, title: chrome.i18n.getMessage('titoloAzione') });
    } catch {}
  }

  async function aScheda(m) {
    const s = await chiam();
    if (!s) return;
    await chrome.tabs.sendMessage(s.tabId, { chiam: m.chiam, ...m }).catch(() => {});
  }

  /** true se la barretta e' nella scheda. Senza, chi e' in call non vedrebbe che si sta trascrivendo. */
  async function iniettaBarretta(tabId, stato) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [PAGINA_BARRETTA] });
      await chrome.tabs.sendMessage(tabId, { chiam: 'avvia', stato });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prima parte dell'avvio, dal pannello: controlli, motore in memoria. Il flusso audio della scheda
   * (tabCapture.getMediaStreamId) lo chiede poi il pannello stesso: un identificativo chiesto dal
   * service worker, in prova, non e' utilizzabile dall'offscreen document, e vale pochi secondi,
   * per questo si chiede dopo che il motore e' pronto.
   */
  async function prepara(tab) {
    if (!tab || tab.id === undefined) return { pronta: false, motivo: 'nessunaScheda' };
    if (await attiva()) return { pronta: false, motivo: 'giaAttiva' };
    if (!(await permessiConcessi())) return { pronta: false, motivo: 'permessi' };
    await c.assicuraOffscreen();
    const mic = await c.aOffscreen({ tipo: 'chiamMicrofono' });
    if (mic.permesso !== 'granted') {
      await c.apriMicrofono();
      return { pronta: false, motivo: 'microfono', permesso: mic.permesso };
    }
    const pronto = await c.aOffscreen({ tipo: 'chiamPronto' });
    if (!pronto.completo) return { pronta: false, motivo: 'modello', byte: pronto.byte };
    // la call ha il processore tutto per se': lettura e dettatura si fermano
    await c.fermaLettura();
    await c.fermaDettatura();
    const prep = await c.aOffscreen({ tipo: 'chiamPrepara' });
    if (!prep.ok) return { pronta: false, motivo: 'errore', errore: prep.errore };
    return { pronta: true, tabId: tab.id };
  }

  /** Seconda parte: il flusso della scheda e' stato chiesto dal pannello, qui si apre l'ascolto. */
  async function avvia(tabId, streamId) {
    if (!Number.isInteger(tabId) || typeof streamId !== 'string') return { avviata: false, motivo: 'errore', errore: 'richiesta non valida' };
    if (await attiva()) return { avviata: false, motivo: 'giaAttiva' };
    await recuperaBozza();
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return { avviata: false, motivo: 'nessunaScheda' };
    }
    const s = { tabId: tab.id, titolo: tab.title || '', host: sitoDi(tab.url), inizio: Date.now() };
    await salva(s);
    const r = await c.aOffscreen({ tipo: 'chiamAvvia', streamId, titolo: s.titolo, host: s.host, tabId: tab.id, versione: chrome.runtime.getManifest().version });
    if (r.errore) {
      await salva(null);
      if (r.errore === 'annullata') return { avviata: false, motivo: 'annullata' };
      return { avviata: false, motivo: /tab capture/i.test(r.errore) ? 'scheda' : 'errore', errore: r.errore };
    }
    await badge(tab.id, 'CALL');
    if (!(await iniettaBarretta(tab.id, r.stato))) {
      // senza la barretta nella scheda non si trascrive: il segno visibile e' parte della funzione
      await c.aOffscreen({ tipo: 'chiamFerma', motivo: 'barretta-persa' }).catch(() => {});
      return { avviata: false, motivo: 'errore', errore: 'non riesco a mostrare la barretta in questa pagina' };
    }
    return { avviata: true };
  }

  async function ferma(motivo) {
    const s = await chiam();
    if (!s) return { fermata: false };
    if (await chrome.offscreen.hasDocument()) await c.aOffscreen({ tipo: 'chiamFerma', motivo }).catch(() => {});
    return { fermata: true };
  }

  async function scaricaModello() {
    if (await attiva()) return { avviato: false };
    await c.assicuraOffscreen();
    // senza attendere: il download dura minuti e il pannello segue l'avanzamento dallo stato
    c.aOffscreen({ tipo: 'chiamPrepara' }).catch(() => {});
    return { avviato: true };
  }

  async function stato() {
    // l'offscreen serve anche solo per sapere se il modello e' gia' sul computer
    await c.assicuraOffscreen();
    const r = await c.aOffscreen({ tipo: 'chiamStato' }).catch(() => null);
    const pronto = await c.aOffscreen({ tipo: 'chiamPronto' }).catch(() => null);
    return { stato: r && r.stato, attiva: !!(r && r.attiva), concessi: await permessiConcessi(), modelloPronto: !!(pronto && pronto.completo), byte: pronto && pronto.byte };
  }

  async function chiusa() {
    const s = await chiam();
    if (s) {
      schedeConBadge.add(s.tabId);
      await aScheda({ chiam: 'fine' });
    }
    // il segno CALL si toglie da tutte le schede dove e' comparso, non solo da quella della call
    for (const id of schedeConBadge) await badge(id, '');
    schedeConBadge.clear();
    await salva(null);
  }

  /** Una trascrizione interrotta e mai salvata (SW o Chrome fermati) si salva da sola prima di una nuova. */
  async function recuperaBozza() {
    const { chiamataBozza: b, chiamataDaSalvare: daSalvare, chiamataUltima: u } = await chrome.storage.local.get(['chiamataBozza', 'chiamataDaSalvare', 'chiamataUltima']);
    if (!b || !Array.isArray(b.righe) || !b.righe.length) return;
    // il testo finale, completo, e' gia' li' (da salvare o in salvataggio): la bozza, piu' vecchia, non serve
    if (daSalvare || (u && u.inCorso)) return;
    // salvata davvero dopo la bozza: la bozza e' un avanzo
    if (u && u.salvata && (u.quando || 0) >= (b.fine || b.inizio || 0)) {
      await chrome.storage.local.remove('chiamataBozza');
      return;
    }
    try {
      const t = creaTrascrizione();
      t.importa(b);
      const testo = markdown({ trascrizione: t, titolo: b.titolo, host: b.host, inizio: new Date(b.inizio), fine: new Date(b.fine || b.inizio), versione: chrome.runtime.getManifest().version, finePrematura: 'la trascrizione si era interrotta e questo è il testo recuperato' });
      await scrivi({ testo, nomeFile: nomeFileChiamata(b.titolo, new Date(b.inizio)), righe: t.righe, lacune: t.lacune, motivo: 'recuperata' });
    } catch {}
  }

  /** Il download e' riuscito solo quando Chrome lo dice: fino ad allora il testo resta in memoria dell'estensione. */
  let ascolta = false;
  function ascoltaDownload() {
    if (ascolta || !chrome.downloads || !chrome.downloads.onChanged) return;
    ascolta = true;
    chrome.downloads.onChanged.addListener(async (d) => {
      if (!d.state) return;
      const { chiamataUltima: u } = await chrome.storage.local.get('chiamataUltima');
      if (!u || u.downloadId !== d.id) return;
      if (d.state.current === 'complete') {
        await chrome.storage.local.set({ chiamataUltima: { ...u, salvata: true, inCorso: false, errore: undefined } });
        await chrome.storage.local.remove(['chiamataBozza', 'chiamataDaSalvare']);
      } else if (d.state.current === 'interrupted') {
        await chrome.storage.local.set({ chiamataUltima: { ...u, salvata: false, inCorso: false, errore: 'download interrotto' } });
      }
    });
  }
  ascoltaDownload();

  /** Salva il file nei download (cartella WebG Voice); se non si puo', lo tiene per il pannello. */
  async function scrivi(m) {
    const ultima = { nomeFile: m.nomeFile, righe: m.righe, lacune: m.lacune, quando: Date.now(), motivo: m.motivo || null };
    // prima si tiene il testo (finche' il file non e' davvero scritto), poi si scarica
    await chrome.storage.local.set({ chiamataUltima: { ...ultima, salvata: false, inCorso: true }, chiamataDaSalvare: { nomeFile: m.nomeFile, testo: m.testo, quando: Date.now() } });
    try {
      if (!(await chrome.permissions.contains({ permissions: ['downloads'] }))) throw new Error('permesso downloads revocato');
      ascoltaDownload();
      const id = await chrome.downloads.download({
        url: `data:text/markdown;charset=utf-8,${encodeURIComponent(m.testo)}`,
        filename: `${CARTELLA}/${m.nomeFile}`,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      await chrome.storage.local.set({ chiamataUltima: { ...ultima, downloadId: id, salvata: false, inCorso: true } });
      // completato (o interrotto) lo dice onChanged; se il download era gia' finito prima di questo punto si controlla ora
      const [d] = await chrome.downloads.search({ id });
      if (d && d.state === 'complete') {
        await chrome.storage.local.set({ chiamataUltima: { ...ultima, downloadId: id, salvata: true, inCorso: false } });
        await chrome.storage.local.remove(['chiamataBozza', 'chiamataDaSalvare']);
      }
    } catch (e) {
      // il pannello offre "Salva" con il testo tenuto qui
      await chrome.storage.local.set({ chiamataUltima: { ...ultima, salvata: false, inCorso: false, errore: String((e && e.message) || e) } });
    }
  }

  /** Messaggi dall'offscreen document (gia' verificati dal chiamante). */
  async function daOffscreen(msg) {
    if (msg.tipo === 'livelloChiamata') {
      await aScheda({ chiam: 'livello', liv: msg.liv });
      return;
    }
    if (msg.tipo === 'statoChiamata') {
      ultimoStato = msg.stato;
      const s = await chiam();
      if (s) await aScheda({ chiam: 'stato', stato: msg.stato });
      return;
    }
    if (msg.tipo === 'bozzaChiamata') {
      if (msg.bozza && Array.isArray(msg.bozza.righe)) await chrome.storage.local.set({ chiamataBozza: msg.bozza });
      return;
    }
    if (msg.tipo === 'chiamataFinita') {
      // una dopo l'altra: il file si scrive prima che la scheda e lo stato vengano ripuliti
      codaAzioni = codaAzioni
        .then(async () => {
          if (typeof msg.testo === 'string' && msg.righe === 0 && !msg.lacune) {
            // nessun parlato e nessun tratto perso: un file vuoto non serve a nessuno
            await chrome.storage.local.set({ chiamataUltima: { salvata: false, errore: 'nessun parlato riconosciuto', quando: Date.now() } });
            await chrome.storage.local.remove(['chiamataBozza', 'chiamataDaSalvare']);
          } else if (typeof msg.testo === 'string') await scrivi(msg);
          else if (msg.errore !== 'annullata') await chrome.storage.local.set({ chiamataUltima: { salvata: false, errore: msg.errore || 'nessun testo', quando: Date.now() } });
          await chiusa();
        })
        .catch(() => {});
      await codaAzioni;
    }
  }

  // la scheda catturata e' un'altra da quella attiva: il segno resta visibile su ogni scheda
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if (await chiam()) badge(tabId, 'CALL');
  });
  // scheda chiusa: l'offscreen vede finire il flusso e salva da solo; qui si ripulisce se non c'e' piu'
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const s = await chiam();
    if (s && s.tabId === tabId && !(await chrome.offscreen.hasDocument())) await salva(null);
  });
  // la pagina si ricarica o cambia (la call continua): la barretta si rimette
  chrome.tabs.onUpdated.addListener(async (tabId, info) => {
    if (info.status !== 'complete') return;
    const s = await chiam();
    if (s && s.tabId === tabId) {
      await badge(tabId, 'CALL');
      // la pagina e' cambiata (anche dominio): se la barretta non puo' tornare, la trascrizione si ferma e si salva
      let st = ultimoStato;
      if (!st) st = ((await c.aOffscreen({ tipo: 'chiamStato' }).catch(() => null)) || {}).stato || null;
      if (st && !(await iniettaBarretta(tabId, st))) {
        // una navigazione intermedia (accesso, reindirizzamento) puo' far fallire il primo tentativo
        await new Promise((ok) => setTimeout(ok, 1500));
        if (!(await iniettaBarretta(tabId, st))) await ferma('barretta-persa');
      }
    }
  });


  const eLaScheda = async (tabId) => {
    const s = await chiam();
    return !!s && s.tabId === tabId;
  };

  return { prepara, avvia, ferma, attiva, stato, scaricaModello, daOffscreen, permessiConcessi, eLaScheda };
}
