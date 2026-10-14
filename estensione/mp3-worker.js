// Codificatore MP3 in un Web Worker (classico, per caricare lamejs con importScripts):
// riceve l'audio a pezzi man mano che la sintesi lo produce e tiene solo l'MP3
// compresso, cosi' la memoria cresce di circa 0,5 MB al minuto e non di 5,8.
/* global lamejs */
importScripts('vendor/lame/lame.all.js');

const PEZZO = 1152 * 16;
let codificatore = null;
let parti = [];
let campioni = 0;
let frequenza = 24000;

function int16(audio) {
  const out = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const x = Math.max(-1, Math.min(1, audio[i]));
    out[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
  }
  return out;
}

self.onmessage = (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'inizia') {
      frequenza = m.frequenza;
      codificatore = new lamejs.Mp3Encoder(1, m.frequenza, m.kbps);
      parti = [];
      campioni = 0;
      self.postMessage({ tipo: 'iniziato', id: m.id });
    } else if (m.tipo === 'aggiungi') {
      if (!codificatore) return;
      const pcm = int16(m.audio);
      for (let i = 0; i < pcm.length; i += PEZZO) {
        const out = codificatore.encodeBuffer(pcm.subarray(i, i + PEZZO));
        if (out.length) parti.push(new Uint8Array(out.buffer, out.byteOffset, out.length));
      }
      campioni += pcm.length;
    } else if (m.tipo === 'fine') {
      if (!codificatore) throw new Error('codifica non avviata');
      const out = codificatore.flush();
      if (out.length) parti.push(new Uint8Array(out.buffer, out.byteOffset, out.length));
      const blob = new Blob(parti, { type: 'audio/mpeg' });
      self.postMessage({ tipo: 'fatto', id: m.id, blob, secondi: campioni / frequenza });
      codificatore = null;
      parti = [];
    } else if (m.tipo === 'annulla') {
      codificatore = null;
      parti = [];
      campioni = 0;
    }
  } catch (e) {
    self.postMessage({ tipo: 'errore', id: m.id, messaggio: String((e && e.message) || e) });
  }
};
