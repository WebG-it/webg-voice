// Quando liberare il motore (circa 0,9-1,2 GB di memoria) e quando tenerlo pronto.
// Ricaricarlo costa circa 1,5 secondi in piu' sulla prima lettura (partenza a freddo).

export const RIPOSO_BREVE_MS = 10 * 60 * 1000;
export const RIPOSO_LUNGO_MS = 30 * 60 * 1000;

/**
 * true se il motore si puo' liberare.
 * - fermoMs: da quanto non si legge (ne' si crea un MP3);
 * - chromeFermoMs: da quanto in Chrome non cambia scheda, finestra o pagina;
 * - tienePronta: l'opzione "tieni la voce pronta mentre uso Chrome".
 * Con l'opzione accesa la voce resta pronta fino a 30 minuti dall'ultima lettura, finche' Chrome
 * e' in uso; se Chrome resta fermo 10 minuti si libera prima. Con l'opzione spenta si libera
 * dopo 10 minuti senza letture, come nella 1.2.
 */
export function daLiberare({ fermoMs, chromeFermoMs, tienePronta }) {
  if (fermoMs >= RIPOSO_LUNGO_MS) return true;
  if (fermoMs < RIPOSO_BREVE_MS) return false;
  return !tienePronta || chromeFermoMs >= RIPOSO_BREVE_MS;
}
