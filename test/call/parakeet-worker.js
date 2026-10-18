// Banco (solo test): Parakeet TDT 0.6B v3 int8 in ONNX Runtime Web, decodifica greedy TDT.
let ort, pre, enc, dj, vocab, BLK;
import { Parakeet, leggiVocabolario } from '/src/lib/parakeet.js';

function leggiWav(b) {
  const dv = new DataView(b);
  let off = 12;
  const q = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  while (off < b.byteLength - 8 && q(off) !== 'data') off += 8 + dv.getUint32(off + 4, true);
  const n = Math.min(dv.getUint32(off + 4, true), b.byteLength - off - 8) / 2;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = dv.getInt16(off + 8 + 2 * i, true) / 32768;
  return a;
}

let motore;
export async function trascriviAudio(audio) {
  const t0 = performance.now();
  const r = await motore.trascrivi(audio);
  return { ...r, msTotali: Math.round(performance.now() - t0), secAudio: +(audio.length / 16000).toFixed(2) };
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'carica') {
      ort = await import('/ort/ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.numThreads = m.fili || 8;
      const f = async (n) => new Uint8Array(await (await fetch(`/modelli/parakeet/${n}`)).arrayBuffer());
      const t0 = performance.now();
      vocab = (await (await fetch('/modelli/parakeet/vocab.txt')).text()).split('\n').filter(Boolean).map((r) => r.replace(/ \d+$/, ''));
      BLK = vocab.length - 1;
      const [a, b, c] = await Promise.all([f('nemo128.onnx'), f('encoder-model.int8.onnx'), f('decoder_joint-model.int8.onnx')]);
      const tFetch = performance.now() - t0;
      const t1 = performance.now();
      const opz = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', ...(m.opzioni || {}) };
      pre = await ort.InferenceSession.create(a, opz);
      enc = await ort.InferenceSession.create(b, opz);
      dj = await ort.InferenceSession.create(c, opz);
      motore = new Parakeet(ort, { pre, enc, dj, vocab });
      self.postMessage({ id: m.id, ok: true, msFetch: Math.round(tFetch), msSessioni: Math.round(performance.now() - t1), fili: ort.env.wasm.numThreads, isolato: self.crossOriginIsolated, blk: BLK });
    } else if (m.tipo === 'gc') {
      if (typeof gc === 'function') gc();
      self.postMessage({ id: m.id, ok: true });
    } else if (m.tipo === 'trascrivi') {
      const audio = m.url ? leggiWav(await fetch(m.url).then((r) => r.arrayBuffer())) : m.audio;
      self.postMessage({ id: m.id, ok: true, ...(await trascriviAudio(audio)) });
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, errore: String((e && e.stack) || e) });
  }
};
