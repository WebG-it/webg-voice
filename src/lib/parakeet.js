// Parakeet TDT 0.6B v3 (NVIDIA, int8) in ONNX Runtime Web, per la trascrizione delle call.
// Tre modelli ONNX: il calcolo dello spettro (nemo128), l'encoder FastConformer e il decoder con
// la testa "joint" del transducer TDT, che oltre al token prevede di quanti frame avanzare.
// La decodifica e' greedy, come nel riferimento (onnx-asr). Riconosce da solo la lingua.

const DURATE = [0, 1, 2, 3, 4]; // frame (80 ms l'uno) di cui avanza il decoder dopo un'uscita
const MAX_SIMBOLI_PER_FRAME = 10;
const MAX_TOKEN = 3000;
const DIM_ENCODER = 1024;
const DIM_STATO = 640;

/** Testo di vocab.txt ("token id" per riga) -> array di token indicizzato per id. */
export function leggiVocabolario(testo) {
  const v = [];
  for (const riga of testo.split('\n')) {
    const m = /^(.*) (\d+)$/.exec(riga.replace(/\r$/, ''));
    if (m) v[+m[2]] = m[1];
  }
  return v;
}

/** Token -> testo: "▁" e' lo spazio, i token speciali (<...>) non si scrivono. */
export function componiTesto(vocab, ids) {
  let t = '';
  for (const id of ids) {
    const p = vocab[id];
    if (p === undefined || /^<.*>$/.test(p)) continue;
    t += p.replace(/▁/g, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

export class Parakeet {
  /**
   * @param ort modulo onnxruntime-web
   * @param {{pre, enc, dj, vocab: string[]}} m sessioni (spettro, encoder, decoder joint) e vocabolario
   */
  constructor(ort, m) {
    this.ort = ort;
    Object.assign(this, { pre: m.pre, enc: m.enc, dj: m.dj, vocab: m.vocab });
    this.blank = m.vocab.length - 1;
  }

  /**
   * Trascrive un segmento di parlato (Float32Array, 16 kHz, mono).
   * `annullato()` si controlla fra un frame e l'altro: se vero, si esce con quello che c'e'.
   * @returns {{testo, token, frame, msSpettro, msEncoder, msDecoder, annullato}}
   */
  async trascrivi(audio, { annullato } = {}) {
    const { ort } = this;
    const t0 = performance.now();
    const p = await this.pre.run({
      waveforms: new ort.Tensor('float32', audio, [1, audio.length]),
      waveforms_lens: new ort.Tensor('int64', BigInt64Array.from([BigInt(audio.length)]), [1]),
    });
    const t1 = performance.now();
    const e = await this.enc.run({ audio_signal: p.features, length: p.features_lens });
    const t2 = performance.now();
    const T = e.outputs.dims[2];
    const dati = e.outputs.data; // [1, 1024, T]
    let s1 = new ort.Tensor('float32', new Float32Array(2 * DIM_STATO), [2, 1, DIM_STATO]);
    let s2 = new ort.Tensor('float32', new Float32Array(2 * DIM_STATO), [2, 1, DIM_STATO]);
    let prec = this.blank;
    const ids = [];
    const logp = []; // log-probabilita' di ogni token scritto: misura quanto il modello e' sicuro
    const frame = new Float32Array(DIM_ENCODER);
    const B = this.blank;
    let t = 0;
    let fermato = false;
    while (t < T && ids.length < MAX_TOKEN) {
      if (annullato && annullato()) {
        fermato = true;
        break;
      }
      for (let c = 0; c < DIM_ENCODER; c++) frame[c] = dati[c * T + t];
      let emessi = 0;
      for (;;) {
        const r = await this.dj.run({
          encoder_outputs: new ort.Tensor('float32', frame, [1, DIM_ENCODER, 1]),
          targets: new ort.Tensor('int32', Int32Array.from([prec]), [1, 1]),
          target_length: new ort.Tensor('int32', Int32Array.from([1]), [1]),
          input_states_1: s1,
          input_states_2: s2,
        });
        const o = r.outputs.data;
        let bi = 0;
        for (let i = 1; i <= B; i++) if (o[i] > o[bi]) bi = i;
        let bd = 0;
        for (let i = 1; i < DURATE.length; i++) if (o[B + 1 + i] > o[B + 1 + bd]) bd = i;
        const d = DURATE[bd];
        if (bi !== B) {
          // log-softmax del token scelto sui soli token (le durate sono un'altra testa)
          let somma = 0;
          for (let i = 0; i <= B; i++) somma += Math.exp(o[i] - o[bi]);
          logp.push(-Math.log(somma));
          ids.push(bi);
          s1 = r.output_states_1;
          s2 = r.output_states_2;
          prec = bi;
          emessi++;
        }
        if (d > 0) {
          t += d;
          break;
        }
        if (bi === B || emessi >= MAX_SIMBOLI_PER_FRAME) {
          t += 1;
          break;
        }
      }
    }
    const t3 = performance.now();
    return {
      testo: componiTesto(this.vocab, ids),
      token: ids.length,
      logprobMedio: logp.length ? +(logp.reduce((a, v) => a + v, 0) / logp.length).toFixed(3) : 0,
      logprobMin: logp.length ? +Math.min(...logp).toFixed(3) : 0,
      frame: T,
      msSpettro: Math.round(t1 - t0),
      msEncoder: Math.round(t2 - t1),
      msDecoder: Math.round(t3 - t2),
      annullato: fermato,
    };
  }

  async rilascia() {
    for (const s of [this.pre, this.enc, this.dj]) {
      try {
        await s.release();
      } catch {}
    }
  }
}
