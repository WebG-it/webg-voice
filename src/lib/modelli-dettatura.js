// Modelli Whisper della dettatura. Si scaricano alla prima attivazione della dettatura, non
// all'installazione, e restano nell'archivio locale (IndexedDB) come il modello della lettura.
//
// Fonti, in ordine: decoder e tokenizzatore da Hugging Face (revisione fissata), poi la copia
// identica nella release "dettatura-v1" del repository WebG su GitHub. Gli encoder sono ritoccati
// (scripts/accorcia-encoder.py: stessi pesi, finestra corta) e stanno solo nella release: se non
// si scaricano, la riserva e' l'encoder originale di Hugging Face, che funziona ma lavora sempre
// su 30 secondi (piu' lento). L'impronta SHA-256 si controlla sempre.
//
// Misure sul PC di sviluppo (Ryzen 7 7735U, 8 fili, frase di 3-5 secondi, dalla fine del parlato
// al testo): base 0,6-0,85 s, small 0,9-1,35 s su processore; large-v3-turbo 0,85-1,15 s su
// WebGPU, troppo lento su processore (oltre 4 s). Vedi test/dettatura/banco.mjs.

const GITHUB = 'https://github.com/WebG-it/webg-voice/releases/download/dettatura-v1/';
const HF = 'https://huggingface.co/onnx-community/';
const REV = {
  base: 'whisper-base/resolve/1846881b6b3a3024392c1eea3ad983695bc23925/',
  small: 'whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/',
  turbo: 'whisper-large-v3-turbo/resolve/360ebcde2559d60bb474678be3c1de9ef347d01a/',
};

const TOKENIZZATORE = {
  nome: 'vocabolario della dettatura',
  byte: 2480466,
  sha256: '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566',
  fonti: [`${HF}${REV.small}tokenizer.json`, `${GITHUB}whisper-tokenizer.json`],
};

/** File scaricabili: chiave nell'archivio -> { nome, byte, sha256, fonti } */
export const FILE_DETTATURA = {
  dettTok: TOKENIZZATORE,
  dettTokTurbo: {
    nome: 'vocabolario del modello Qualità',
    byte: 2480617,
    sha256: '6d8cbd7cd0d8d5815e478dac67b85a26bbe77c1f5e0c6d76d1ce2abc0e5f21ca',
    fonti: [`${HF}${REV.turbo}tokenizer.json`, `${GITHUB}whisper-turbo-tokenizer.json`],
  },
  dettBaseEnc: {
    nome: 'modello Leggero, parte 1',
    byte: 23156120,
    sha256: '3fbe58b61c83afc4fe92f5d6139d22d6b56877b9efb45f383a57503ac824b3d1',
    fonti: [`${GITHUB}whisper-base-encoder-int8-corto.onnx`],
  },
  dettBaseEncIntero: {
    nome: 'modello Leggero, parte 1 (versione completa)',
    byte: 23201297,
    sha256: 'ca6177401f86a2c6b4dc5f7fc02fbca680678906bd0c22f6d89f0b80f124253f',
    fonti: [`${HF}${REV.base}onnx/encoder_model_int8.onnx`],
  },
  dettBaseDec: {
    nome: 'modello Leggero, parte 2',
    byte: 53693315,
    sha256: 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b',
    fonti: [`${HF}${REV.base}onnx/decoder_model_merged_int8.onnx`, `${GITHUB}whisper-base-decoder-int8.onnx`],
  },
  dettSmallEnc: {
    nome: 'modello Normale, parte 1',
    byte: 92236367,
    sha256: '38bbd0b13f0e8bca6bce6dd1320ae0ca19c8dfa5b19989136c43dec563cf38ca',
    fonti: [`${GITHUB}whisper-small-encoder-int8-corto.onnx`],
  },
  dettSmallEncIntero: {
    nome: 'modello Normale, parte 1 (versione completa)',
    byte: 92326127,
    sha256: '2601c9eb2d345c5916d4576d36f663a7c96589740fb2273828c48c3fc2c7db75',
    fonti: [`${HF}${REV.small}onnx/encoder_model_int8.onnx`],
  },
  dettSmallDec: {
    nome: 'modello Normale, parte 2',
    byte: 156750845,
    sha256: 'ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9',
    fonti: [`${HF}${REV.small}onnx/decoder_model_merged_int8.onnx`, `${GITHUB}whisper-small-decoder-int8.onnx`],
  },
  dettTurboEnc: {
    nome: 'modello Qualità, parte 1',
    byte: 369856808,
    sha256: '3b3a134ac40599497ab84cdf17b5d002077a9b8e57c40b1eee628dfa28d353d5',
    fonti: [`${GITHUB}whisper-turbo-encoder-q4f16-corto.onnx`],
  },
  dettTurboEncIntero: {
    nome: 'modello Qualità, parte 1 (versione completa)',
    byte: 369974078,
    sha256: 'aafd3383f1aa372db0825a885730ebbbae7e34871ec0460428663c69641a63d0',
    fonti: [`${HF}${REV.turbo}onnx/encoder_model_q4f16.onnx`],
  },
  dettTurboDec: {
    nome: 'modello Qualità, parte 2',
    byte: 193505017,
    sha256: '45981cdd958a4c8e1447839850d2e6e27e30974ccbe31b4a1e5ebe9ad8965a5f',
    fonti: [`${HF}${REV.turbo}onnx/decoder_model_merged_q4f16.onnx`, `${GITHUB}whisper-turbo-decoder-q4f16.onnx`],
  },
};

/**
 * Modelli fra cui si sceglie. `ep`: dove gira (wasm = processore, webgpu = scheda video).
 * teste/dimTesta/layer servono a creare la cache vuota del decoder.
 */
export const MODELLI_DETTATURA = {
  leggero: {
    nome: 'Leggero',
    whisper: 'base',
    descrizione: 'per computer lenti: 77 MB, piu\' veloce, sbaglia di piu\'',
    ep: 'wasm',
    nMel: 80,
    teste: 8,
    dimTesta: 64,
    layer: 6,
    encoder: 'dettBaseEnc',
    encoderIntero: 'dettBaseEncIntero',
    decoder: 'dettBaseDec',
    tokenizzatore: 'dettTok',
  },
  normale: {
    nome: 'Normale',
    whisper: 'small',
    descrizione: 'consigliato: 250 MB, gira sul processore',
    ep: 'wasm',
    nMel: 80,
    teste: 12,
    dimTesta: 64,
    layer: 12,
    encoder: 'dettSmallEnc',
    encoderIntero: 'dettSmallEncIntero',
    decoder: 'dettSmallDec',
    tokenizzatore: 'dettTok',
  },
  qualita: {
    nome: 'Qualità',
    whisper: 'large-v3-turbo',
    descrizione: 'il piu\' preciso: 565 MB, usa la scheda video',
    ep: 'webgpu',
    nMel: 128,
    teste: 20,
    dimTesta: 64,
    layer: 4,
    encoder: 'dettTurboEnc',
    encoderIntero: 'dettTurboEncIntero',
    decoder: 'dettTurboDec',
    tokenizzatore: 'dettTokTurbo',
  },
};
export const MODELLO_DETTATURA_PREDEFINITO = 'normale';
export const modelloDettaturaValido = (m) => (typeof m === 'string' && Object.hasOwn(MODELLI_DETTATURA, m) ? m : MODELLO_DETTATURA_PREDEFINITO);

/** Byte da scaricare per un modello (encoder ritoccato, decoder, tokenizzatore). */
export const byteModello = (id) => {
  const m = MODELLI_DETTATURA[modelloDettaturaValido(id)];
  return [m.encoder, m.decoder, m.tokenizzatore].reduce((s, k) => s + FILE_DETTATURA[k].byte, 0);
};
