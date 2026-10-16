// Banco di misura della dettatura (solo test): carica un modello Whisper e trascrive i file
// che gli si passano, riportando i tempi. Gira in un Web Worker come nell'estensione.
import { Whisper } from '/src/lib/whisper.js';
import { creaTokenizzatore } from '/src/lib/tokenizzatore.js';

let w = null;

function leggiWav(b) {
  // WAV PCM 16 bit mono 16 kHz
  const dv = new DataView(b);
  let off = 12;
  const quattro = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  while (off < b.byteLength - 8 && quattro(off) !== 'data') off += 8 + dv.getUint32(off + 4, true);
  const n = Math.min(dv.getUint32(off + 4, true), b.byteLength - off - 8) / 2;
  const audio = new Float32Array(n);
  for (let i = 0; i < n; i++) audio[i] = dv.getInt16(off + 8 + 2 * i, true) / 32768;
  return audio;
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'carica') {
      const ort = await import(m.ep === 'webgpu' ? '/ort/ort.webgpu.min.mjs' : '/ort/ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.numThreads = m.fili || 8;
      const t0 = performance.now();
      const [tj, eb, db] = await Promise.all([
        fetch(m.base + '/tokenizer.json').then((r) => r.json()),
        fetch(m.base + '/onnx/' + m.encoder).then((r) => r.arrayBuffer()),
        fetch(m.base + '/onnx/' + m.decoder).then((r) => r.arrayBuffer()),
      ]);
      const tFetch = performance.now() - t0;
      const opz = { executionProviders: [m.ep || 'wasm'], graphOptimizationLevel: 'all' };
      const t1 = performance.now();
      const encoder = await ort.InferenceSession.create(new Uint8Array(eb), opz);
      const opzDec = { ...opz };
      if (m.ep === 'webgpu') {
        const pl = {};
        for (let i = 0; i < m.layer; i++) for (const a of ['decoder', 'encoder']) for (const b of ['key', 'value']) pl[`present.${i}.${a}.${b}`] = 'gpu-buffer';
        opzDec.preferredOutputLocation = pl;
      }
      const decoder = await ort.InferenceSession.create(new Uint8Array(db), opzDec);
      const tSess = performance.now() - t1;
      w = new Whisper(ort, {
        encoder,
        decoder,
        tok: creaTokenizzatore(tj),
        nMel: m.nMel,
        teste: m.teste,
        dimTesta: m.dimTesta,
        finestraVariabile: !!m.variabile,
        gpu: m.ep === 'webgpu',
      });
      self.postMessage({ id: m.id, ok: true, msFetch: Math.round(tFetch), msSessioni: Math.round(tSess), isolato: self.crossOriginIsolated, fili: ort.env.wasm.numThreads });
    } else if (m.tipo === 'trascrivi') {
      const audio = leggiWav(await fetch(m.url).then((r) => r.arrayBuffer()));
      const t = performance.now();
      const r = await w.trascrivi(audio, { prompt: m.prompt, margine: m.margine ?? 1 });
      self.postMessage({ id: m.id, ok: true, ...r, secAudio: +(audio.length / 16000).toFixed(2), msTotali: Math.round(performance.now() - t) });
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, errore: String((e && e.stack) || e) });
  }
};
