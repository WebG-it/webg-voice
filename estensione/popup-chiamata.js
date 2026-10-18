// Pannello: "Trascrivi la call". Permessi facoltativi (tabCapture e downloads) chiesti al clic,
// download del modello, avvio e stop, ultimo file salvato e recupero di una trascrizione interrotta.

import { creaTrascrizione, markdown, nomeFileChiamata } from './lib/chiamata-testo.js';
import { PERMESSI_CHIAMATA } from './chiamata-permessi.js';

const $ = (id) => document.getElementById(id);
const comando = (tipo, extra = {}) => chrome.runtime.sendMessage({ a: 'background', tipo, ...extra });
const MB = (b) => `${Math.round(b / 1e6)} MB`;
const durata = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const due = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${due(Math.floor((s % 3600) / 60))}:${due(s % 60)}`;
};

const bottone = $('chiamata');
const box = $('chiamataBox');
let aperto = false;
let timer = null;
let messaggio = ''; // esito dell'ultima azione, mostrato finche' non cambia lo stato

function riga(testo, classe = '') {
  const p = document.createElement('p');
  p.textContent = testo;
  if (classe) p.className = classe;
  return p;
}
function pulsante(testo, onclick, primario = false) {
  const b = document.createElement('button');
  b.textContent = testo;
  if (primario) b.className = 'primario';
  b.addEventListener('click', onclick);
  return b;
}
function azioni(...bottoni) {
  const d = document.createElement('div');
  d.className = 'azioniStato';
  d.append(...bottoni);
  return d;
}
function salvaConAncora(nomeFile, testo) {
  const url = URL.createObjectURL(new Blob([testo], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function testoDaBozza(b) {
  const t = creaTrascrizione();
  t.importa(b);
  return markdown({ trascrizione: t, titolo: b.titolo, host: b.host, inizio: new Date(b.inizio), fine: new Date(b.fine || b.inizio), versione: chrome.runtime.getManifest().version });
}

const MOTIVI = (r) =>
  ({
    permessi: 'Servono i permessi per catturare la scheda e salvare il file.',
    microfono: 'Serve il permesso del microfono: ho aperto la pagina per consentirlo, poi riprova.',
    modello: 'Prima serve scaricare il modello.',
    giaAttiva: 'Una trascrizione è già in corso.',
    nessunaScheda: 'Non trovo la scheda della call.',
    annullata: 'Trascrizione annullata prima di partire.',
    scheda: `Chrome non permette di catturare questa scheda${r.errore ? ` (${r.errore})` : ''}. Apri la call in una scheda normale e riprova.`,
    errore: `Non riesco ad avviare: ${r.errore || 'errore'}`,
  })[r.motivo] || (r.errore ? `Non riesco ad avviare: ${r.errore}` : 'Non riesco ad avviare la trascrizione.');

/** Spunta una tantum: chi trascrive si assume l'avviso ai partecipanti. */
let consensoDato = false;
function consenso() {
  const l = document.createElement('label');
  l.className = 'consenso';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = consensoDato;
  c.addEventListener('change', async () => {
    consensoDato = c.checked;
    await chrome.storage.local.set({ chiamataConsenso: consensoDato });
  });
  l.append(c, ' Avviserò i partecipanti e ho titolo a trascrivere questa call.');
  return l;
}

async function eliminaModello() {
  messaggio = 'Modello eliminato dal computer. Si riscarica la prossima volta che serve.';
  await comando('chiamataCancella');
  await aggiorna();
}

async function avvia() {
  messaggio = '';
  if (!consensoDato) {
    messaggio = 'Per iniziare spunta che avviserai i partecipanti.';
    return aggiorna();
  }
  // 1. controlli e motore in memoria (il service worker)
  const p = await comando('chiamataPrepara');
  if (!p || !p.pronta) {
    messaggio = p ? MOTIVI(p) : 'Non riesco ad avviare la trascrizione.';
    return aggiorna();
  }
  // 2. il flusso audio della scheda lo chiede il pannello, nel gesto dell'utente
  let streamId;
  try {
    if (!chrome.tabCapture) throw new Error('permesso appena concesso: chiudi e riapri il pannello');
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: p.tabId });
  } catch (e) {
    messaggio = `Chrome non permette di catturare questa scheda (${(e && e.message) || e}). Apri la call in una scheda normale e riprova.`;
    return aggiorna();
  }
  // 3. l'ascolto parte
  const r = await comando('chiamataAvvia', { tabId: p.tabId, streamId });
  messaggio = r && r.avviata ? 'Trascrizione partita. Puoi chiudere questo pannello: la barretta rossa è nella scheda.' : r ? MOTIVI(r) : 'Non riesco ad avviare la trascrizione.';
  await aggiorna();
}

async function inizia() {
  if (!consensoDato) {
    messaggio = 'Per iniziare spunta che avviserai i partecipanti.';
    return aggiorna();
  }
  // il permesso si chiede nel gesto del clic, prima di qualsiasi altra attesa
  let ok = false;
  try {
    ok = await chrome.permissions.request({ permissions: PERMESSI_CHIAMATA });
  } catch {
    // permessi gia' fra quelli dell'estensione (build di prova): niente da chiedere
    ok = await chrome.permissions.contains({ permissions: PERMESSI_CHIAMATA });
  }
  if (!ok) {
    messaggio = 'Senza i permessi non posso catturare la scheda né salvare il file. Non è stato attivato niente.';
    return aggiorna();
  }
  return avvia();
}

async function disegna(s, ultima, bozza, daSalvare) {
  box.replaceChildren();
  const st = s.stato;
  const attiva = s.attiva;
  const inPrep = st && st.fase === 'preparazione' && !attiva;
  if (attiva && st) {
    const t = st.inizio ? durata(Date.now() - st.inizio) : '';
    box.append(riga(`Sto trascrivendo «${st.titolo || 'la scheda'}» · ${t} · ${st.righe} frasi`));
    if (st.fase === 'chiusura') box.append(riga('Finisco di trascrivere e salvo il file…'));
    else {
      if (st.codaSec > 60) box.append(riga('Il computer è occupato: la trascrizione è in ritardo.', 'avviso'));
      box.append(azioni(pulsante('Ferma e salva', () => comando('chiamataFerma').then(aggiorna), true)));
    }
  } else if (inPrep && st.download && st.download.totale) {
    box.append(riga(`Scarico il modello: ${MB(st.download.scaricati)} di ${MB(st.download.totale)}`));
    const p = document.createElement('progress');
    p.max = 1;
    p.value = st.download.scaricati / st.download.totale;
    box.append(p);
  } else if (inPrep) {
    box.append(riga('Preparo il motore… tieni aperto questo pannello finché non compare la barretta rossa nella scheda.'));
  } else {
    box.append(riga('Trascrive la call della scheda aperta (Meet, Teams, Zoom nel browser) e il tuo microfono, sul tuo computer, e salva un file .md nei download. Niente audio lascia il computer.'));
    if (!s.concessi) {
      box.append(riga('Chrome ti chiederà due permessi: catturare l\'audio della scheda e salvare il file. Solo se usi questa funzione.'));
      box.append(consenso());
      box.append(azioni(pulsante('Consenti e inizia', inizia, true)));
    } else if (!s.modelloPronto) {
      box.append(riga(`Prima serve scaricare il modello (${s.byte ? MB(s.byte) : 'circa 670 MB'}, una volta sola).`));
      box.append(azioni(pulsante('Scarica il modello', async () => (await comando('chiamataScarica'), aggiorna()), true)));
    } else {
      box.append(riga('Avvisa i partecipanti che stai trascrivendo: la barretta nella scheda ti dà un messaggio da incollare nella chat.'));
      box.append(consenso());
      box.append(azioni(pulsante('Inizia a trascrivere questa scheda', avvia, true), pulsante('Elimina il modello', eliminaModello)));
    }
  }
  if (!attiva && st && st.fase === 'errore' && st.errore && !messaggio) box.append(riga(`Errore: ${st.errore}`, 'avviso'));
  if (messaggio) box.append(riga(messaggio, 'avviso'));
  if (!attiva && ultima && !ultima.salvata && !daSalvare && ultima.errore && Date.now() - ultima.quando < 120000) {
    box.append(riga(`L'ultima trascrizione non è riuscita: ${ultima.errore}`, 'avviso'));
  }
  if (!attiva && ultima) {
    if (ultima.inCorso) {
      box.append(riga(`Salvo il file: ${ultima.nomeFile}…`));
    } else if (ultima.salvata) {
      box.append(riga(`Salvato: ${ultima.nomeFile} (${ultima.righe} frasi)`));
      if (ultima.downloadId !== undefined)
        box.append(azioni(pulsante('Mostra nella cartella', () => chrome.downloads && chrome.downloads.show(ultima.downloadId))));
    } else if (daSalvare) {
      box.append(riga('Non sono riuscito a salvare il file da solo.', 'avviso'));
      box.append(
        azioni(
          pulsante(
            'Salva ora',
            async () => {
              salvaConAncora(daSalvare.nomeFile, daSalvare.testo);
              await chrome.storage.local.remove(['chiamataDaSalvare', 'chiamataBozza']);
              aggiorna();
            },
            true
          ),
          pulsante('Elimina', async () => (await chrome.storage.local.remove(['chiamataDaSalvare', 'chiamataBozza']), aggiorna()))
        )
      );
    }
  }
  if (!attiva && !daSalvare && bozza && bozza.righe && bozza.righe.length) {
    box.append(riga(`Una trascrizione si è interrotta prima di salvarsi (${bozza.righe.length} frasi).`, 'avviso'));
    box.append(
      azioni(
        pulsante(
          'Salva',
          async () => {
            salvaConAncora(nomeFileChiamata(bozza.titolo, new Date(bozza.inizio)), testoDaBozza(bozza));
            await chrome.storage.local.remove(['chiamataBozza', 'chiamataDaSalvare']);
            aggiorna();
          },
          true
        ),
        pulsante('Elimina', async () => (await chrome.storage.local.remove('chiamataBozza'), aggiorna()))
      )
    );
  }
}

async function aggiorna() {
  if (!aperto) return;
  let s;
  try {
    s = await comando('chiamataStato');
  } catch {
    return;
  }
  if (!s || s.errore) return;
  const { chiamataUltima, chiamataBozza, chiamataDaSalvare, chiamataConsenso } = await chrome.storage.local.get(['chiamataUltima', 'chiamataBozza', 'chiamataDaSalvare', 'chiamataConsenso']);
  if (chiamataConsenso === true) consensoDato = true;
  // il nome dell'ultimo file contiene il titolo della call: dopo un giorno si dimentica
  if (chiamataUltima && Date.now() - (chiamataUltima.quando || 0) > 86400000) await chrome.storage.local.remove('chiamataUltima');
  await disegna(s, chiamataUltima, chiamataBozza, chiamataDaSalvare);
}

bottone.addEventListener('click', () => {
  aperto = !aperto;
  box.hidden = !aperto;
  clearInterval(timer);
  if (aperto) {
    messaggio = '';
    aggiorna();
    timer = setInterval(aggiorna, 1000);
  }
});
// se c'e' una trascrizione in corso o interrotta, il riquadro si apre da solo
(async () => {
  try {
    const s = await comando('chiamataStato');
    const { chiamataBozza } = await chrome.storage.local.get('chiamataBozza');
    if ((s && s.attiva) || (chiamataBozza && chiamataBozza.righe && chiamataBozza.righe.length)) bottone.click();
  } catch {}
})();
