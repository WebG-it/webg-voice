// Modello della trascrizione delle call: Parakeet TDT 0.6B v3 (NVIDIA, licenza CC-BY-4.0), in ONNX
// int8 convertito da istupakov (stessa licenza). Si scarica solo la prima volta che si usa la
// funzione, a pezzi e con ripresa come gli altri modelli, e resta nell'archivio locale.
//
// Fonte: Hugging Face alla revisione fissata; l'impronta SHA-256 si controlla sempre.
// Misure sul PC di sviluppo (un portatile di fascia media, 8 fili): rapporto col tempo reale 0,21 contro 0,37 di
// Whisper small, errori sulle 20 frasi di prova 24,5% contro 30,7%. Vedi test/call/.

const HF = 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/';

/** File scaricabili: chiave nell'archivio -> { nome, byte, sha256, fonti } */
export const FILE_CHIAMATA = {
  chiamEnc: {
    nome: 'modello delle call, parte 1',
    byte: 652183999,
    sha256: '6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09',
    fonti: [`${HF}encoder-model.int8.onnx`],
  },
  chiamDec: {
    nome: 'modello delle call, parte 2',
    byte: 18202004,
    sha256: 'eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70',
    fonti: [`${HF}decoder_joint-model.int8.onnx`],
  },
  chiamSpettro: {
    nome: 'modello delle call, parte 3',
    byte: 139764,
    sha256: 'a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f',
    fonti: [`${HF}nemo128.onnx`],
  },
  chiamVoc: {
    nome: 'vocabolario delle call',
    byte: 93939,
    sha256: 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',
    fonti: [`${HF}vocab.txt`],
  },
};

export const MODELLO_CHIAMATA = {
  nome: 'Parakeet TDT 0.6B v3',
  encoder: 'chiamEnc',
  decoder: 'chiamDec',
  spettro: 'chiamSpettro',
  vocabolario: 'chiamVoc',
};

export const FILE_DEL_MODELLO_CHIAMATA = [MODELLO_CHIAMATA.encoder, MODELLO_CHIAMATA.decoder, MODELLO_CHIAMATA.spettro, MODELLO_CHIAMATA.vocabolario];

/** Byte da scaricare in tutto. */
export const byteChiamata = FILE_DEL_MODELLO_CHIAMATA.reduce((s, k) => s + FILE_CHIAMATA[k].byte, 0);
