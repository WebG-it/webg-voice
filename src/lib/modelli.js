// File del modello scaricati al primo avvio e tenuti in IndexedDB (lib/archivio.js).
import { esiste } from './archivio.js';
//
// Sorgente primaria: gli asset della release "model-v1" del repository WebG
// su GitHub (scripts/pubblica-modello.sh). Riserva automatica: la stessa
// revisione fissata del repository Hugging Face. L'impronta SHA-256 si controlla
// sempre, qualunque sia la sorgente: i byte devono essere esattamente questi.
//
// Si usa il modello fp32 (non quantizzato): in WebAssembly la versione int8 e'
// 2-3 volte piu' lenta del tempo reale, mentre fp32 con 8 fili sta sotto.

const GITHUB = 'https://github.com/WebG-it/webg-voice/releases/download/model-v1/';
const HF_REV = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const HF = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${HF_REV}/`;

export const FILE_REMOTI = {
  voce: {
    nome: 'stile della voce Sara',
    byte: 522240,
    sha256: '409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c',
    fonti: [`${GITHUB}if_sara.bin`, `${HF}voices/if_sara.bin`],
  },
  modello: {
    nome: 'modello Kokoro',
    byte: 325532232,
    sha256: '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb',
    fonti: [`${GITHUB}kokoro-v1.0-fp32.onnx`, `${HF}onnx/model.onnx`],
  },
};

export const BYTE_TOTALI = Object.values(FILE_REMOTI).reduce((s, f) => s + f.byte, 0);

/** Chiavi nell'archivio locale. */
export const chiave = (nome) => `v1/${nome}`;
export const chiaveParte = (nome, i) => `v1/parti/${nome}/${i}`;

/** true se modello e voce sono gia' sul computer. */
export async function modelliInCache() {
  for (const k of Object.keys(FILE_REMOTI)) if (!(await esiste(chiave(k)))) return false;
  return true;
}
