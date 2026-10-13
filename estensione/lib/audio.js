// Ritaglio del silenzio come kokoro_onnx/trim.py (copia di librosa.effects.trim):
// RMS su finestre di 2048 campioni ogni 512, centrato con zeri, soglia 60 dB
// sotto il massimo. Serve a unire i blocchi senza buchi, aggiungendo poi la
// pausa che la punteggiatura chiede.

export const FREQUENZA = 24000;

export function ritaglia(y, { topDb = 60, finestra = 2048, passo = 512 } = {}) {
  const n = y.length;
  const meta = finestra >> 1;
  const nFin = 1 + Math.floor(n / passo); // len(y)+2*meta-finestra, diviso passo, +1
  const rms = new Float32Array(nFin);
  // somme prefisse dei quadrati sul segnale imbottito di zeri
  const pref = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + y[i] * y[i];
  const somma = (a, b) => {
    const da = Math.max(0, Math.min(n, a));
    const fino = Math.max(0, Math.min(n, b));
    return fino > da ? pref[fino] - pref[da] : 0;
  };
  let max = 0;
  for (let f = 0; f < nFin; f++) {
    const inizio = f * passo - meta;
    const v = Math.sqrt(somma(inizio, inizio + finestra) / finestra);
    rms[f] = v;
    if (v > max) max = v;
  }
  // amplitude_to_db(rms, ref=max) > -topDb  <=>  10log10(max(1e-10, p)) - 10log10(max(1e-10, ref^2)) > -topDb
  const refDb = 10 * Math.log10(Math.max(1e-10, max * max));
  let primo = -1;
  let ultimo = -1;
  for (let f = 0; f < nFin; f++) {
    const db = 10 * Math.log10(Math.max(1e-10, rms[f] * rms[f])) - refDb;
    if (db > -topDb) {
      if (primo < 0) primo = f;
      ultimo = f;
    }
  }
  if (primo < 0) return y.subarray(0, 0);
  const inizio = primo * passo;
  const fine = Math.min(n, (ultimo + 1) * passo);
  return y.subarray(inizio, fine);
}

/** Aggiunge `secondi` di silenzio in coda. */
export function conPausa(y, secondi) {
  const extra = Math.round(secondi * FREQUENZA);
  if (!extra) return y;
  const out = new Float32Array(y.length + extra);
  out.set(y, 0);
  return out;
}

/** Float32 mono -> WAV PCM 16 bit. */
export function wav(campioni, frequenza = FREQUENZA) {
  const n = campioni.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  s(8, 'WAVE');
  s(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, frequenza, true);
  v.setUint32(28, frequenza * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, campioni[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(buf);
}
