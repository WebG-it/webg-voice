// Trascrizione con Whisper in ONNX Runtime Web: encoder una volta per segmento, poi
// decodifica avida (greedy) con la cache delle chiavi e dei valori. Niente librerie
// esterne oltre a ONNX Runtime: log-mel in lib/mel.js, tokenizzatore in lib/tokenizzatore.js.
//
// Finestra variabile: l'encoder originale di Whisper vuole sempre 30 secondi. I modelli
// della dettatura sono ritoccati (scripts/accorcia-encoder.py) perche' accettino una
// finestra piu' corta, pari al parlato piu' un secondo: su una frase di 4 secondi
// l'encoder costa un ottavo. Con un encoder non ritoccato si usa la finestra intera.

import { logMel, FREQ_DETTATURA } from './mel.js';

// simboli che Whisper non deve produrre (suppress_tokens di generation_config, parte comune)
const SOPPRESSI = [
  1, 2, 7, 8, 9, 10, 14, 25, 26, 27, 28, 29, 31, 58, 59, 60, 61, 62, 63, 90, 91, 92, 93, 359, 503, 522, 542, 873, 893, 902, 918, 922, 931, 1350,
  1853, 1982, 2460, 2627, 3246, 3253, 3268, 3536, 3846, 3961, 4183, 4667, 6585, 6647, 7273, 9061, 9383, 10428, 10929, 11938, 12033, 12331, 12562,
  13793, 14157, 14635, 15265, 15618, 16553, 16604, 18362, 18956, 20075, 21675, 22520, 26130, 26161, 26435, 28279, 29464, 31650, 32302, 32470,
  36865, 42863, 47425, 49870, 50254,
];
const SPAZIO = 220;

// float16 (Uint16) -> float32, per i modelli fp16 su WebGPU
function daMezzo(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

/** Riga `riga` dei logit come Float32Array (copia). */
function rigaLogit(dati, riga, V) {
  const out = new Float32Array(V);
  const o = riga * V;
  if (dati instanceof Uint16Array) for (let i = 0; i < V; i++) out[i] = daMezzo(dati[o + i]);
  else out.set(dati.subarray(o, o + V));
  return out;
}

function logSoftmaxDi(lg, id) {
  let max = -Infinity;
  for (let i = 0; i < lg.length; i++) if (lg[i] > max) max = lg[i];
  let s = 0;
  for (let i = 0; i < lg.length; i++) s += Math.exp(lg[i] - max);
  return lg[id] - max - Math.log(s);
}

/**
 * Gruppo che la coda dei token ripete: fino a 4 token ripetuti 4 volte, da 5 a 11 ripetuti 3 volte,
 * frasi intere (da 12 a 80 token) ripetute 2 volte di fila.
 * Restituisce { k, volte } o null.
 */
export function ripetizione(tok) {
  for (let k = 1; k <= 80; k++) {
    const volte = k <= 4 ? 4 : k <= 11 ? 3 : 2;
    if (tok.length < k * volte) continue;
    let uguale = true;
    for (let r = 1; r < volte && uguale; r++) {
      for (let i = 0; i < k; i++) {
        if (tok[tok.length - 1 - i] !== tok[tok.length - 1 - i - r * k]) {
          uguale = false;
          break;
        }
      }
    }
    if (uguale) return { k, volte };
  }
  return null;
}

export class Whisper {
  /**
   * @param {object} ort modulo di ONNX Runtime Web
   * @param {object} o { encoder, decoder: InferenceSession, tok: tokenizzatore, nMel, teste, dimTesta, finestraVariabile, gpu }
   */
  constructor(ort, o) {
    this.ort = ort;
    Object.assign(this, o);
    const t = o.tok;
    this.id = {
      sot: t.speciale('<|startoftranscript|>'),
      it: t.speciale('<|it|>'),
      trascrivi: t.speciale('<|transcribe|>'),
      senzaTempi: t.speciale('<|notimestamps|>'),
      fine: t.speciale('<|endoftext|>'),
      prima: t.speciale('<|startofprev|>'),
      silenzio: t.speciale('<|nospeech|>') ?? t.speciale('<|nocaptions|>'),
    };
    this.passati = this.decoder.inputNames.filter((n) => n.startsWith('past_key_values.'));
    this.tipoPassati = 'float32';
    const meta = this.decoder.inputMetadata;
    if (Array.isArray(meta)) {
      const m = meta.find((x) => x.name === this.passati[0]);
      if (m && m.type === 'float16') this.tipoPassati = 'float16';
    }
  }

  /** Token del prompt iniziale (termini ricorrenti), al massimo 120. */
  tokenPrompt(prompt) {
    const p = String(prompt || '').trim();
    if (!p) return [];
    const ids = this.tok.codifica(' ' + p);
    return ids.slice(-120);
  }

  vuoto(nome) {
    const forma = [1, this.teste, 0, this.dimTesta];
    return this.tipoPassati === 'float16'
      ? new this.ort.Tensor('float16', new Uint16Array(0), forma)
      : new this.ort.Tensor('float32', new Float32Array(0), forma);
  }

  /**
   * Trascrive un segmento (Float32Array a 16 kHz, al massimo 30 s).
   * Restituisce { testo, token, msEncoder, msDecoder, probSilenzio, logprobMedio, ripetuto }.
   */
  async trascrivi(audio, { prompt = '', margine = 1, maxToken, passiFissi = 0, annullato = null } = {}) {
    const { ort } = this;
    const sec = audio.length / FREQ_DETTATURA;
    let nFrame = 3000;
    if (this.finestraVariabile) {
      // a gradini (1 s sul processore, 2 s sulla scheda video): poche forme diverse, e su WebGPU
      // ogni forma nuova costa la preparazione dei suoi shader
      const passo = this.gpu ? 200 : 100;
      nFrame = Math.min(3000, Math.max(200, Math.ceil(((sec + margine) * 100) / passo) * passo));
    }
    const t0 = performance.now();
    const mel = logMel(audio, this.nMel, nFrame);
    const msMel = performance.now() - t0;
    const t1 = performance.now();
    const enc = await this.encoder.run({ input_features: new ort.Tensor('float32', mel, [1, this.nMel, nFrame]) });
    const stati = enc.last_hidden_state;
    const msEncoder = performance.now() - t1;

    const p = this.tokenPrompt(prompt);
    const prefisso = [...(p.length ? [this.id.prima, ...p] : []), this.id.sot, this.id.it, this.id.trascrivi, this.id.senzaTempi];
    const posSot = p.length ? p.length + 1 : 0;
    const limite = passiFissi || Math.min(maxToken || Math.ceil(sec * 7 + 20), 440 - prefisso.length);
    const V = this.tok.dimensione;
    const nascosti = new Set(SOPPRESSI);

    const t2 = performance.now();
    let feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(prefisso.map(BigInt)), [1, prefisso.length]),
      encoder_hidden_states: stati,
      use_cache_branch: new ort.Tensor('bool', Uint8Array.of(0), [1]),
    };
    for (const n of this.passati) feeds[n] = this.vuoto(n);
    const usciti = [];
    let passatiEncoder = null;
    let probSilenzio = 0;
    let somma = 0;
    let ripetuto = null;
    let interrotto = false;
    const daLiberare = [];
    try {
      for (let passo = 0; passo < limite; passo++) {
        // trascrizione in anticipo non piu' utile (si e' ripreso a parlare): ci si ferma qui
        if (annullato && annullato()) {
          interrotto = true;
          break;
        }
        const r = await this.decoder.run(feeds);
        const logit = r.logits;
        const dati = this.gpu && logit.location === 'gpu-buffer' ? await logit.getData() : logit.data;
        const righe = logit.dims[1];
        const lg = rigaLogit(dati, righe - 1, V);
        if (passo === 0 && this.id.silenzio !== undefined) {
          const ls = rigaLogit(dati, posSot, V);
          probSilenzio = Math.exp(logSoftmaxDi(ls, this.id.silenzio));
        }
        if (this.gpu && logit.dispose) logit.dispose();
        // niente token speciali (ne' tempi), niente simboli soppressi
        for (let i = this.id.fine + 1; i < V; i++) lg[i] = -Infinity;
        for (const i of nascosti) lg[i] = -Infinity;
        if (passo === 0) lg[SPAZIO] = -Infinity;
        if (passo === 0 || passiFissi) lg[this.id.fine] = -Infinity;
        let mi = 0;
        for (let i = 1; i < V; i++) if (lg[i] > lg[mi]) mi = i;
        if (mi === this.id.fine) break;
        somma += logSoftmaxDi(lg, mi);
        usciti.push(mi);
        ripetuto = passiFissi ? null : ripetizione(usciti);
        if (ripetuto) break;
        // cache: le chiavi dell'encoder si calcolano al primo passo e restano quelle
        const nuovi = {
          input_ids: new ort.Tensor('int64', BigInt64Array.of(BigInt(mi)), [1, 1]),
          encoder_hidden_states: stati,
          use_cache_branch: new ort.Tensor('bool', Uint8Array.of(1), [1]),
        };
        if (!passatiEncoder) {
          passatiEncoder = {};
          for (const n of this.passati) if (n.includes('.encoder.')) passatiEncoder[n] = r[n.replace('past_key_values', 'present')];
        }
        for (const n of this.passati) {
          if (n.includes('.encoder.')) nuovi[n] = passatiEncoder[n];
          else {
            nuovi[n] = r[n.replace('past_key_values', 'present')];
            if (this.gpu && feeds[n] && feeds[n].dispose) daLiberare.push(feeds[n]);
          }
        }
        // su GPU: le uscite della cache encoder dei passi successivi sono vuote, si liberano
        if (this.gpu) {
          for (const n of this.passati) {
            const pr = r[n.replace('past_key_values', 'present')];
            if (n.includes('.encoder.') && pr !== passatiEncoder[n] && pr.dispose) pr.dispose();
          }
          for (const t of daLiberare.splice(0)) t.dispose();
        }
        feeds = nuovi;
      }
    } finally {
      if (this.gpu) {
        for (const n of this.passati) if (feeds[n] && feeds[n].dispose && feeds[n].location === 'gpu-buffer') feeds[n].dispose();
        if (stati.dispose) stati.dispose();
      }
    }
    let token = usciti;
    // ripetizione in coda (allucinazione): si tiene una copia sola del gruppo ripetuto
    if (ripetuto) token = usciti.slice(0, usciti.length - ripetuto.k * (ripetuto.volte - 1));
    const msDecoder = performance.now() - t2;
    return {
      testo: this.tok.decodifica(token).trim(),
      token: token.length,
      nFrame,
      msMel: Math.round(msMel),
      msEncoder: Math.round(msEncoder),
      msDecoder: Math.round(msDecoder),
      probSilenzio: +probSilenzio.toFixed(3),
      logprobMedio: usciti.length ? +(somma / usciti.length).toFixed(3) : 0,
      ripetuto: !!ripetuto,
      annullato: interrotto,
    };
  }

  /**
   * Misura sul posto: encoder su 4 secondi di rumore leggero e 16 passi del decoder, come una
   * frase tipica di 4 secondi. La prima passata prepara i kernel (soprattutto su WebGPU) e non conta.
   */
  async misura() {
    const audio = new Float32Array(4 * FREQ_DETTATURA);
    let s = 12345;
    for (let i = 0; i < audio.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      audio[i] = ((s / 0x7fffffff) * 2 - 1) * 0.01;
    }
    // due passate di riscaldamento sulla stessa lunghezza: WebAssembly e ONNX Runtime si assestano
    await this.trascrivi(audio, { passiFissi: 4 });
    await this.trascrivi(audio, { passiFissi: 4 });
    const t = performance.now();
    const r = await this.trascrivi(audio, { passiFissi: 16 });
    return { ms: Math.round(performance.now() - t), msEncoder: r.msEncoder, msDecoder: r.msDecoder, msPerToken: Math.round(r.msDecoder / 16) };
  }
}
