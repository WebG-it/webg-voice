// Filtro dei frammenti che il riconoscimento inventa dove il parlato non c'e': voci sovrapposte,
// rumore, respiri. Parakeet v3 riconosce la lingua da solo e, su pochi decimi di secondo incerti,
// scrive brevi frasi in inglese o parole a caso ("You know?", "I smoke.", "Quoi."). Il segnale
// e' la sicurezza del modello (log-probabilita' media dei token scritti) insieme alla durata e alla
// lingua. Soglie tarate su una call vera di 18 minuti (173 segmenti): vedi test/call/filtro.mjs.

const SOGLIA_INCERTO = -1.0; // sotto questa sicurezza media non si scrive niente
const SOGLIA_BREVE = -0.75; // per i segmenti brevi si e' piu' severi
const BREVE_SEC = 4;
const SOGLIA_INGLESE = -0.4; // frase tutta in inglese e poco sicura

const INGLESE = new Set(
  "the you your i i'm is are was and to of it's it that this there here have has do don't not yeah oh well just know think what we they be at so but if gonna should could would will can give me my how why when with for in on kind".split(' ')
);
const ITALIANO = new Set(
  'il lo la i gli le un una uno e è di da in con su per non che si ma ho ha sono come più allora poi quindi del della dei al alla mi ti ci te questo questa quello quella cosa perché già anche se sì ok va bene vado faccio dai così ecco aspetta grazie ciao prego scusa certo giusto'.split(' ')
);
const INTERCALARI = new Set('uh um mm mmm hm hmm eh ehm ah oh'.split(' '));
const parole = (t) => (String(t).toLowerCase().match(/[a-zàèéìòùç']+/g) || []).filter(Boolean);

/**
 * @param {{testo: string, logprobMedio: number, durata: number}} s durata in secondi
 * @returns {{tieni: boolean, motivo?: string}}
 */
export function valutaSegmento({ testo, logprobMedio, durata }) {
  const t = String(testo || '').trim();
  if (!t) return { tieni: false, motivo: 'vuoto' };
  const lp = typeof logprobMedio === 'number' ? logprobMedio : 0;
  if (lp < SOGLIA_INCERTO) return { tieni: false, motivo: 'incerto' };
  if (durata <= BREVE_SEC && lp < SOGLIA_BREVE) return { tieni: false, motivo: 'breve e incerto' };
  const w = parole(t);
  if (w.length && w.every((p) => INTERCALARI.has(p))) return { tieni: false, motivo: 'intercalare' };
  let e = 0;
  let i = 0;
  for (const p of w) {
    if (INGLESE.has(p)) e++;
    if (ITALIANO.has(p)) i++;
  }
  if (w.length >= 3 && e >= 2 && i === 0 && lp < SOGLIA_INGLESE) return { tieni: false, motivo: 'inglese incerto' };
  return { tieni: true };
}
