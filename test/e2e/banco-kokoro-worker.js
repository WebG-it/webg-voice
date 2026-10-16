// Banco dei modelli Kokoro (solo test): stessa catena della lettura (eSpeak, fonemi, voce Sara),
// modello scelto da URL (fp32, fp16, q8, q4...) e motore (wasm o webgpu). Riporta il rapporto
// sintesi/tempo reale sul paragrafo e l'audio, per ascoltarlo.
import creaEspeak from '/ext/vendor/espeak/espeak-ng.mjs';
import { avviaEspeak } from '/ext/lib/espeak.js';
import { creaFonemizzatore, tokenizza, dividiFonemi } from '/ext/lib/fonemi.js';
import { normalizza } from '/ext/lib/normalizza.js';
import { ritaglia, conPausa, wav } from '/ext/lib/audio.js';

const DIM = 256;
let ort = null;
let sessione = null;
let voce = null;
let fonemizza = null;

async function prepara(m) {
  ort = await import(m.ep === 'webgpu' ? '/ext/vendor/ort/ort.webgpu.min.mjs' : '/ext/vendor/ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = '/ext/vendor/ort/';
  ort.env.wasm.numThreads = m.fili || 8;
  const [w, ind, dati] = await Promise.all([
    fetch('/ext/vendor/espeak/espeak-ng.wasm').then((r) => r.arrayBuffer()),
    fetch('/ext/vendor/espeak/espeak-dati.json').then((r) => r.json()),
    fetch('/ext/vendor/espeak/espeak-dati.bin').then((r) => r.arrayBuffer()),
  ]);
  const clausole = await avviaEspeak({ creaModulo: creaEspeak, wasm: new Uint8Array(w), indice: ind, dati: new Uint8Array(dati) });
  fonemizza = creaFonemizzatore(clausole, { rimuoviMarcatori: true });
  const v = new Uint8Array(await (await fetch('/kokoro/if_sara.bin')).arrayBuffer());
  voce = new Float32Array(v.buffer, v.byteOffset, v.byteLength / 4);
  const t0 = performance.now();
  const byte = new Uint8Array(await (await fetch(`/kokoro/${m.modello}`)).arrayBuffer());
  sessione = await ort.InferenceSession.create(byte, { executionProviders: [m.ep || 'wasm'], graphOptimizationLevel: 'all' });
  return { caricamentoMs: Math.round(performance.now() - t0), fili: ort.env.wasm.numThreads };
}

async function sintesi(fonemi) {
  const ids = tokenizza(fonemi);
  const t = new BigInt64Array(ids.length + 2);
  ids.forEach((x, i) => (t[i + 1] = BigInt(x)));
  const riga = Math.min(ids.length, voce.length / DIM) - 1;
  const out = await sessione.run({
    input_ids: new ort.Tensor('int64', t, [1, t.length]),
    style: new ort.Tensor('float32', voce.slice(riga * DIM, (riga + 1) * DIM), [1, DIM]),
    speed: new ort.Tensor('float32', Float32Array.of(1), [1]),
  });
  return conPausa(new Float32Array(ritaglia(out.waveform.data)), 0.15);
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'prepara') {
      self.postMessage({ id: m.id, ok: true, ...(await prepara(m)) });
    } else if (m.tipo === 'paragrafo') {
      const lotti = dividiFonemi(fonemizza(normalizza(m.testo)), m.lotto || 150);
      await sintesi(lotti[0]); // riscaldamento
      const parti = [];
      const ms = [];
      const t0 = performance.now();
      for (const l of lotti) {
        const t = performance.now();
        parti.push(await sintesi(l));
        ms.push(Math.round(performance.now() - t));
      }
      const tot = performance.now() - t0;
      const n = parti.reduce((s, p) => s + p.length, 0);
      const audio = new Float32Array(n);
      let o = 0;
      for (const p of parti) (audio.set(p, o), (o += p.length));
      const sec = n / 24000;
      let b = '';
      const w = wav(audio);
      for (let i = 0; i < w.length; i += 0x8000) b += String.fromCharCode(...w.subarray(i, i + 0x8000));
      self.postMessage({ id: m.id, ok: true, lotti: lotti.length, ms, msTotali: Math.round(tot), secondi: +sec.toFixed(2), rtf: +(tot / 1000 / sec).toFixed(3), wav: m.wav ? btoa(b) : null });
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, errore: String((e && e.stack) || e) });
  }
};
