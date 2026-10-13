// Archivio locale dei file del modello in IndexedDB (un oggetto Blob per chiave).
// IndexedDB e non Cache Storage: in alcune configurazioni di Chrome la Cache
// Storage rifiuta ogni scrittura ("Entry already exists"), IndexedDB no.

const DB = 'webg-voice';
const STORE = 'file';
let aperto = null;

function apri() {
  aperto ??= new Promise((ok, ko) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => ok(q.result);
    q.onerror = () => {
      aperto = null;
      ko(q.error);
    };
  });
  return aperto;
}

async function operazione(modo, fn) {
  const db = await apri();
  return new Promise((ok, ko) => {
    const tx = db.transaction(STORE, modo);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error('scrittura annullata (spazio su disco?)'));
  });
}

/** Blob salvato con questa chiave, o undefined. */
export const leggi = (chiave) => operazione('readonly', (s) => s.get(chiave));
/** true se la chiave esiste (senza leggere il contenuto). */
export const esiste = async (chiave) => (await operazione('readonly', (s) => s.count(chiave))) > 0;
export const scrivi = (chiave, dati) => operazione('readwrite', (s) => s.put(dati instanceof Blob ? dati : new Blob([dati]), chiave));
export const cancella = (chiave) => operazione('readwrite', (s) => s.delete(chiave));
export const svuota = () => operazione('readwrite', (s) => s.clear());
