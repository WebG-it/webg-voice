// eSpeak NG 1.52.0 compilato in WebAssembly (scripts/compila-espeak.sh, GPL-3.0),
// usato solo per testo -> fonemi IPA, come fa phonemizer in Python con la
// stessa versione di espeak (espeakng_loader 0.2.4).
//
// I dati di espeak (tabelle fonemi, voce "it", dizionari it ed en) stanno in
// un unico file binario con un indice JSON: li scriviamo nel filesystem
// virtuale di Emscripten e poi chiamiamo espeak_Initialize.

const PERCORSO_DATI = '/espeak-ng-data';
const AUDIO_OUTPUT_SYNCHRONOUS = 2;
const espeakCHARS_UTF8 = 1;
// Stesso modo di phonemizer (wrapper.py): IPA con "_" fra i fonemi
const MODO_FONEMI = ('_'.charCodeAt(0) << 8) | 0x02;

/**
 * @param {object} opz
 * @param {Function} opz.creaModulo  factory Emscripten (export default di espeak-ng.mjs)
 * @param {Uint8Array} opz.wasm      byte di espeak-ng.wasm
 * @param {object} opz.indice        indice dei file { file: { nome: {offset, length} } }
 * @param {Uint8Array} opz.dati      byte del pacchetto dati
 * @param {string} [opz.voce='it']
 * @returns {Promise<(testo: string) => string[]>} testo -> clausole IPA
 */
export async function avviaEspeak({ creaModulo, wasm, indice, dati, voce = 'it' }) {
  const M = await creaModulo({ wasmBinary: wasm });
  for (const [rel, { offset, length }] of Object.entries(indice.file)) {
    const p = `${PERCORSO_DATI}/${rel}`;
    M.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')));
    M.FS.writeFile(p, dati.subarray(offset, offset + length));
  }
  const init = M.cwrap('espeak_Initialize', 'number', ['number', 'number', 'string', 'number']);
  if (init(AUDIO_OUTPUT_SYNCHRONOUS, 0, PERCORSO_DATI, 0) < 0) {
    throw new Error('espeak-ng non si inizializza');
  }
  const setVoce = M.cwrap('espeak_SetVoiceByName', 'number', ['string']);
  if (setVoce(voce) !== 0) throw new Error(`voce espeak "${voce}" non disponibile`);
  let voceAttuale = voce;
  const ttp = M.cwrap('espeak_TextToPhonemes', 'string', ['number', 'number', 'number']);

  // Equivale a EspeakWrapper.text_to_phonemes: chiama finche' il puntatore
  // al testo non diventa NULL, una clausola per volta.
  // `v`: voce espeak per questo testo (default quella iniziale), es. "en-us" per le parole inglesi
  return function clausole(testo, v = voce) {
    if (v !== voceAttuale) {
      if (setVoce(v) !== 0) throw new Error(`voce espeak "${v}" non disponibile`);
      voceAttuale = v;
    }
    const n = M.lengthBytesUTF8(testo) + 1;
    const pTesto = M._malloc(n);
    M.stringToUTF8(testo, pTesto, n);
    const pCella = M._malloc(4);
    M.setValue(pCella, pTesto, 'i32');
    const out = [];
    try {
      while (M.getValue(pCella, 'i32') !== 0) {
        const f = ttp(pCella, espeakCHARS_UTF8, MODO_FONEMI);
        if (f) out.push(f);
      }
    } finally {
      M._free(pTesto);
      M._free(pCella);
    }
    return out;
  };
}
