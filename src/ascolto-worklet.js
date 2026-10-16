// AudioWorklet della dettatura: raccoglie il microfono (gia' a 16 kHz, lo ricampiona Chrome)
// in blocchi da 20 ms e li passa all'offscreen document. Nessuna elaborazione qui.
class Raccoglitore extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blocco = new Float32Array(320);
    this.n = 0;
  }
  process(ingressi) {
    const canale = ingressi[0] && ingressi[0][0];
    if (canale) {
      for (let i = 0; i < canale.length; i++) {
        this.blocco[this.n++] = canale[i];
        if (this.n === this.blocco.length) {
          this.port.postMessage(this.blocco, [this.blocco.buffer]);
          this.blocco = new Float32Array(320);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('webg-raccoglitore', Raccoglitore);
