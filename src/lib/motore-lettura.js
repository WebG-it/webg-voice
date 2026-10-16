// Scelta del motore della lettura: Kokoro "Qualita' massima" (fp32, 326 MB), Kokoro "Bilanciata"
// (uint8, 177 MB: stessa voce, circa il 13% piu' veloce sui computer con pochi core) oppure la voce
// del sistema (speechSynthesis: istantanea e senza carico, ma meno naturale) come ripiego quando
// il computer non regge nemmeno la Bilanciata.
//
// Misure sul PC di sviluppo (Ryzen 7 7735U), paragrafo di 27 s, rapporto sintesi/tempo reale:
//            libero  carico 2 fili  carico 4 fili  3 fili (PC da 4 core)
//   fp32     0,72    0,83           0,99           1,06
//   uint8    0,64-0,79 0,81         0,99           0,92
//   q4f16    0,73    0,91           1,00           1,26
//   int8, q8f16 piu' lenti (1,4-2,3), fp16 piu' lento e sbaglia parole, WebGPU rotto (audio vuoto).
// Test di comprensione con Whisper medium: fp32, uint8, q4f16 e int8 senza errori, fp16 16% di parole sbagliate.

export const MOTORI_LETTURA = {
  auto: { nome: 'Automatica', descrizione: 'sceglie da sola in base alla velocità del computer' },
  massima: { nome: 'Qualità massima', descrizione: 'la voce più naturale, per i computer veloci' },
  bilanciata: { nome: 'Bilanciata', descrizione: 'stessa voce, un po\' più leggera: 177 MB in più, si scaricano la prima volta' },
  sistema: { nome: 'Leggera', descrizione: 'la voce del sistema: parte subito e non pesa sul computer, ma è meno naturale' },
};
export const motoreLetturaValido = (m) => (typeof m === 'string' && Object.hasOwn(MOTORI_LETTURA, m) ? m : 'auto');

// soglie sul rapporto sintesi/tempo reale misurato nelle letture vere (media mobile salvata)
export const SOGLIA_BILANCIATA = 0.9; // oltre: la Bilanciata
export const SOGLIA_SISTEMA = 1.1; // oltre, anche con la Bilanciata: la voce del sistema, se ce n'e' una buona

/**
 * @param {object} o { preferenza, rtf (misurato, undefined se mai letto), voceSistema (o null), bilanciataPronta }
 * @returns {{ motore: 'massima'|'bilanciata'|'sistema', motivo: string, scaricaBilanciata?: boolean }}
 */
export function scegliMotore({ preferenza = 'auto', rtf, voceSistema = null, bilanciataPronta = false }) {
  const pref = motoreLetturaValido(preferenza);
  if (pref === 'sistema') return voceSistema ? { motore: 'sistema', motivo: 'scelta' } : { motore: 'massima', motivo: 'nessuna voce di sistema adatta' };
  if (pref === 'massima') return { motore: 'massima', motivo: 'scelta' };
  if (pref === 'bilanciata') return bilanciataPronta ? { motore: 'bilanciata', motivo: 'scelta' } : { motore: 'massima', motivo: 'bilanciata in arrivo', scaricaBilanciata: true };
  // automatica
  if (typeof rtf !== 'number' || rtf <= SOGLIA_BILANCIATA) return { motore: 'massima', motivo: 'computer veloce' };
  if (rtf > SOGLIA_SISTEMA && voceSistema && voceSistema.locale) return { motore: 'sistema', motivo: 'computer lento' };
  if (bilanciataPronta) return { motore: 'bilanciata', motivo: 'computer carico' };
  return { motore: 'massima', motivo: 'bilanciata in arrivo', scaricaBilanciata: true };
}
