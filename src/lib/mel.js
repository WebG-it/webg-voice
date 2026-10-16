// Caratteristiche log-mel di Whisper, come WhisperFeatureExtractor di transformers:
// finestra di Hann periodica da 400 campioni, passo 160 (10 ms a 16 kHz), riflessione
// ai bordi, spettro di potenza, banco di filtri mel "slaney", log10, taglio a 8 sotto
// il massimo, poi (x + 4) / 4. Solo JavaScript, nessuna libreria.

export const FREQ_DETTATURA = 16000;
const N_FFT = 400;
const HOP = 160;
const BIN = N_FFT / 2 + 1; // 201

// ---- FFT a radici miste (400 = 4 x 4 x 5 x 5) ----
function creaFFT(N) {
  const fattori = [];
  let n = N;
  for (const p of [4, 2, 3, 5]) while (n % p === 0) (fattori.push(p), (n /= p));
  if (n > 1) fattori.push(n);
  const cosT = new Float64Array(N);
  const sinT = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    cosT[i] = Math.cos((2 * Math.PI * i) / N);
    sinT[i] = -Math.sin((2 * Math.PI * i) / N);
  }
  const zr = new Float64Array(8);
  const zi = new Float64Array(8);
  function ric(xr, xi, off, stride, n, yr, yi, yo, k) {
    if (n === 1) {
      yr[yo] = xr[off];
      yi[yo] = xi[off];
      return;
    }
    const p = fattori[k];
    const m = n / p;
    for (let j = 0; j < p; j++) ric(xr, xi, off + j * stride, stride * p, m, yr, yi, yo + j * m, k + 1);
    const passo = N / n;
    const passoP = N / p;
    for (let q = 0; q < m; q++) {
      for (let j = 0; j < p; j++) {
        const a = yr[yo + j * m + q];
        const b = yi[yo + j * m + q];
        const t = (j * q * passo) % N;
        zr[j] = a * cosT[t] - b * sinT[t];
        zi[j] = a * sinT[t] + b * cosT[t];
      }
      for (let s = 0; s < p; s++) {
        let r = 0;
        let im = 0;
        for (let j = 0; j < p; j++) {
          const t = (((j * s) % p) * passoP) % N;
          r += zr[j] * cosT[t] - zi[j] * sinT[t];
          im += zr[j] * sinT[t] + zi[j] * cosT[t];
        }
        yr[yo + q + s * m] = r;
        yi[yo + q + s * m] = im;
      }
    }
  }
  const xi = new Float64Array(N);
  const yr = new Float64Array(N);
  const yi = new Float64Array(N);
  /** Spettro di potenza dei primi N/2+1 bin di un segnale reale. */
  return (xr, potenza) => {
    ric(xr, xi, 0, 1, N, yr, yi, 0, 0);
    for (let i = 0; i < potenza.length; i++) potenza[i] = yr[i] * yr[i] + yi[i] * yi[i];
  };
}

// ---- Banco di filtri mel (scala e normalizzazione "slaney") ----
const LOGSTEP = 27 / Math.log(6.4);
const hzAMel = (f) => (f >= 1000 ? 15 + Math.log(f / 1000) * LOGSTEP : (3 * f) / 200);
const melAHz = (m) => (m >= 15 ? 1000 * Math.exp((m - 15) / LOGSTEP) : (200 * m) / 3);

/** Filtri come righe sparse: { inizio, pesi } per ogni banda. */
export function filtriMel(nMel) {
  const mMin = hzAMel(0);
  const mMax = hzAMel(FREQ_DETTATURA / 2);
  const f = [];
  for (let i = 0; i < nMel + 2; i++) f.push(melAHz(mMin + ((mMax - mMin) * i) / (nMel + 1)));
  const fft = [];
  for (let k = 0; k < BIN; k++) fft.push(((FREQ_DETTATURA / 2) * k) / (BIN - 1));
  const out = [];
  for (let m = 0; m < nMel; m++) {
    const norma = 2 / (f[m + 2] - f[m]);
    const pesi = new Float32Array(BIN);
    let inizio = -1;
    let fine = -1;
    for (let k = 0; k < BIN; k++) {
      const giu = (fft[k] - f[m]) / (f[m + 1] - f[m]);
      const su = (f[m + 2] - fft[k]) / (f[m + 2] - f[m + 1]);
      const v = Math.max(0, Math.min(giu, su)) * norma;
      pesi[k] = v;
      if (v > 0) {
        if (inizio < 0) inizio = k;
        fine = k;
      }
    }
    if (inizio < 0) out.push({ inizio: 0, pesi: new Float32Array(0) });
    else out.push({ inizio, pesi: pesi.slice(inizio, fine + 1) });
  }
  return out;
}

const cacheFiltri = new Map();
let fftPotenza = null;
let hann = null;

/**
 * Log-mel di `audio` (Float32Array a 16 kHz) su `nFrame` fotogrammi da 10 ms.
 * L'audio si completa con silenzio (o si taglia) a nFrame x 160 campioni.
 * Restituisce Float32Array [nMel][nFrame] (riga per banda), pronto per l'encoder.
 */
export function logMel(audio, nMel, nFrame) {
  if (!cacheFiltri.has(nMel)) cacheFiltri.set(nMel, filtriMel(nMel));
  const filtri = cacheFiltri.get(nMel);
  fftPotenza ??= creaFFT(N_FFT);
  if (!hann) {
    hann = new Float64Array(N_FFT);
    for (let i = 0; i < N_FFT; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  }
  const L = nFrame * HOP;
  const n = Math.min(audio.length, L);
  const P = N_FFT / 2;
  // riflessione ai bordi (come numpy "reflect"), oltre la fine dell'audio c'e' silenzio
  const campione = (i) => {
    let j = i - P;
    if (j < 0) j = -j;
    if (j >= L) j = 2 * (L - 1) - j;
    return j < n ? audio[j] : 0;
  };
  const out = new Float32Array(nMel * nFrame);
  const cornice = new Float64Array(N_FFT);
  const pot = new Float64Array(BIN);
  let massimo = -Infinity;
  for (let fr = 0; fr < nFrame; fr++) {
    const base = fr * HOP;
    // dentro l'audio senza bordi: lettura diretta, piu' veloce
    if (base - P >= 0 && base - P + N_FFT <= n) {
      for (let i = 0; i < N_FFT; i++) cornice[i] = audio[base - P + i] * hann[i];
    } else {
      for (let i = 0; i < N_FFT; i++) cornice[i] = campione(base + i) * hann[i];
    }
    fftPotenza(cornice, pot);
    for (let m = 0; m < nMel; m++) {
      const { inizio, pesi } = filtri[m];
      let s = 0;
      for (let k = 0; k < pesi.length; k++) s += pesi[k] * pot[inizio + k];
      const v = Math.log10(Math.max(s, 1e-10));
      out[m * nFrame + fr] = v;
      if (v > massimo) massimo = v;
    }
  }
  const soglia = massimo - 8;
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], soglia) + 4) / 4;
  return out;
}
