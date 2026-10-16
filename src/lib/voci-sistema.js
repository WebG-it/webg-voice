// Voce del sistema per la lettura di ripiego (speechSynthesis). Nessun sistema operativo dato per
// scontato: si prendono le voci italiane che Chrome offre e si sceglie la migliore con un punteggio.
// - locali (localService) prima di tutto: niente testo in rete, partono subito;
// - nomi di voci di buona qualita' (neurali o "naturali", varianti avanzate e premium, le voci
//   italiane piu' curate dei vari sistemi) prima delle altre;
// - eSpeak e simili (sintesi robotica) non sono una voce "decente": se c'e' solo quella, niente ripiego.
// Una voce non locale manda il testo a un servizio in rete: si puo' usare solo se l'utente la sceglie,
// e la pagina delle opzioni lo dice.

const BUONE = /natural|neural|online|enhanced|premium|wavenet|studio|alice|federica|luca|paola|emma|elsa|cosimo|isabella|diego|giuseppe|google/i;
const ROBOTICHE = /espeak|mbrola|festival|pico|svox/i;

/** Punteggio di una voce (piu' alto = meglio); null se non e' italiana o non e' decente. */
export function punteggioVoce(v) {
  if (!v || typeof v.lang !== 'string' || !/^it([-_]|$)/i.test(v.lang)) return null;
  const nome = String(v.name || '');
  if (ROBOTICHE.test(nome)) return null;
  let p = 0;
  if (v.localService) p += 100;
  if (BUONE.test(nome)) p += 30;
  if (/enhanced|premium|natural|neural/i.test(nome)) p += 15;
  if (/^it[-_]IT$/i.test(v.lang)) p += 5; // italiano d'Italia prima di quello svizzero
  if (v.default) p += 2;
  return p;
}

/**
 * La voce migliore, o null se non ce n'e' una italiana decente.
 * @param {Array<{name, lang, localService, voiceURI, default}>} voci speechSynthesis.getVoices()
 * @param {{ soloLocali?: boolean, preferita?: string }} opz preferita: voiceURI scelto dall'utente
 * @returns {{ nome, uri, lang, locale: boolean } | null}
 */
export function scegliVoceSistema(voci, { soloLocali = false, preferita = '' } = {}) {
  const valide = (voci || [])
    .map((v) => ({ v, p: punteggioVoce(v) }))
    .filter((x) => x.p !== null && (!soloLocali || x.v.localService));
  if (!valide.length) return null;
  const scelta = (preferita && valide.find((x) => x.v.voiceURI === preferita || x.v.name === preferita)) || valide.sort((a, b) => b.p - a.p)[0];
  const v = scelta.v;
  return { nome: v.name, uri: v.voiceURI || v.name, lang: v.lang, locale: !!v.localService };
}

/** Elenco per le opzioni: voci italiane decenti, migliori prima. */
export function vociItaliane(voci) {
  return (voci || [])
    .map((v) => ({ v, p: punteggioVoce(v) }))
    .filter((x) => x.p !== null)
    .sort((a, b) => b.p - a.p)
    .map(({ v }) => ({ nome: v.name, uri: v.voiceURI || v.name, lang: v.lang, locale: !!v.localService }));
}
