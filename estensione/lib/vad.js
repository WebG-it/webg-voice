// Ritaglio del parlato alle pause (VAD a energia, adattivo al rumore di fondo), per la dettatura.
// Riceve blocchi da 20 ms a 16 kHz e consegna segmenti: uno per frase o per pezzo di frase.
//
// Per stare sotto il secondo e mezzo dalla fine del parlato, la trascrizione parte "in anticipo"
// dopo 360 ms di silenzio (anticipo): se si ricomincia a parlare entro i 600 ms (fine segmento)
// quella trascrizione si butta e il segmento continua; altrimenti e' gia' pronta o quasi.

export const BLOCCO = 320; // campioni, 20 ms a 16 kHz
const MS = 20;

export const PARAMETRI = {
  inizio: 3, // blocchi di parlato di fila per cominciare un segmento (60 ms)
  prima: 15, // blocchi tenuti prima dell'inizio (300 ms): non si perde l'attacco della parola
  anticipo: 18, // blocchi di silenzio per la trascrizione in anticipo (360 ms)
  fine: 30, // blocchi di silenzio per chiudere il segmento (600 ms)
  coda: 10, // blocchi di silenzio tenuti in fondo al segmento (200 ms)
  minimo: 10, // blocchi di parlato minimi perche' il segmento valga (200 ms)
  massimo: 1000, // blocchi massimi per segmento (20 s): oltre si taglia nel punto piu' silenzioso
  lungo: 150, // blocchi (3 s) oltre cui il segmento si chiude anche a una pausa breve
  anticipoLungo: 10, // ... trascrizione in anticipo dopo 200 ms di silenzio
  fineLungo: 16, // ... e chiusura dopo 320 ms: le frasi lunghe arrivano a pezzi mentre si parla
  sopraRumore: 10, // dB sopra il rumore di fondo per dire "parlato"
  sogliaMinima: -52, // dBFS sotto cui non e' mai parlato
};

const energia = (b) => {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return 10 * Math.log10(s / b.length + 1e-10);
};

function unisci(blocchi) {
  const out = new Float32Array(blocchi.length * BLOCCO);
  blocchi.forEach((b, i) => out.set(b, i * BLOCCO));
  return out;
}

/**
 * @param {object} cb { inizio(), anticipo(audio, info), ripresa(), fine(audio, info), scarto() }
 *   info: { pausa: secondi di silenzio prima del segmento, durata, fineParlato: ms (orologio dei blocchi) }
 */
export function creaSegmentatore(cb, opz = {}) {
  const P = { ...PARAMETRI, ...opz };
  let rumore = -60;
  let tempo = 0; // ms dall'avvio, contati sui blocchi
  let prima = []; // ultimi blocchi prima dell'inizio
  let seg = null; // { blocchi, energie, parlato, silenzio, consecutivi, anticipato }
  let consecutivi = 0;
  let fineUltimo = null; // ms della fine del parlato del segmento precedente

  function chiudi(motivo) {
    const s = seg;
    seg = null;
    if (!s) return;
    if (s.parlato < P.minimo) {
      cb.scarto && cb.scarto(motivo);
      return;
    }
    const tieni = s.blocchi.length - Math.max(0, s.silenzio - P.coda);
    const audio = unisci(s.blocchi.slice(0, tieni));
    const info = { pausa: s.pausa, durata: (tieni * MS) / 1000, fineParlato: s.fineParlato, motivo, anticipato: s.anticipato, silenzioMs: s.silenzio * MS };
    fineUltimo = s.fineParlato;
    cb.fine && cb.fine(audio, info);
  }

  function spezza() {
    // segmento troppo lungo: si taglia nel blocco piu' silenzioso degli ultimi 3 secondi
    const s = seg;
    const da = Math.max(P.minimo, s.blocchi.length - 150);
    let k = s.blocchi.length - 1;
    for (let i = da; i < s.blocchi.length; i++) if (s.energie[i] < s.energie[k]) k = i;
    const resto = s.blocchi.slice(k + 1);
    const restoE = s.energie.slice(k + 1);
    s.blocchi = s.blocchi.slice(0, k + 1);
    s.energie = s.energie.slice(0, k + 1);
    s.silenzio = 0;
    s.fineParlato = tempo - resto.length * MS;
    chiudi('lungo');
    seg = { blocchi: resto, energie: restoE, parlato: resto.length, silenzio: 0, anticipato: false, pausa: 0, fineParlato: tempo };
    cb.inizio && cb.inizio();
  }

  return {
    /** Un blocco da 20 ms (Float32Array di 320 campioni). */
    aggiungi(b) {
      tempo += MS;
      const e = energia(b);
      const parlato = e > Math.max(rumore + P.sopraRumore, P.sogliaMinima);
      // rumore di fondo: scende subito, sale piano e solo fuori dal parlato
      if (e < rumore) rumore = e;
      else if (!parlato && !seg) rumore += 0.03 * (e - rumore);
      else if (!parlato) rumore += 0.01 * (e - rumore);
      if (!seg) {
        prima.push(b);
        if (prima.length > P.prima) prima.shift();
        consecutivi = parlato ? consecutivi + 1 : 0;
        if (consecutivi >= P.inizio) {
          const pausa = fineUltimo === null ? 99 : (tempo - prima.length * MS - fineUltimo) / 1000;
          seg = { blocchi: prima.slice(), energie: prima.map(energia), parlato: consecutivi, silenzio: 0, anticipato: false, pausa, fineParlato: tempo };
          prima = [];
          consecutivi = 0;
          cb.inizio && cb.inizio();
        }
        return;
      }
      seg.blocchi.push(b);
      seg.energie.push(e);
      if (parlato) {
        seg.parlato++;
        seg.fineParlato = tempo;
        if (seg.anticipato && seg.silenzio > 0) {
          seg.anticipato = false;
          cb.ripresa && cb.ripresa();
        }
        seg.silenzio = 0;
      } else {
        seg.silenzio++;
        const lungo = seg.blocchi.length - seg.silenzio > P.lungo;
        const anticipo = lungo ? P.anticipoLungo : P.anticipo;
        const fine = lungo ? P.fineLungo : P.fine;
        if (seg.silenzio === anticipo && !seg.anticipato && seg.parlato >= P.minimo && cb.anticipo) {
          seg.anticipato = true;
          const tieni = seg.blocchi.length - Math.max(0, seg.silenzio - P.coda);
          cb.anticipo(unisci(seg.blocchi.slice(0, tieni)), { pausa: seg.pausa, durata: (tieni * MS) / 1000, fineParlato: seg.fineParlato });
        }
        if (seg.silenzio >= fine) {
          chiudi('pausa');
          return;
        }
      }
      if (seg.blocchi.length >= P.massimo) spezza();
    },
    /** Fine dell'ascolto: il segmento in corso si chiude com'e'. */
    termina() {
      if (seg) chiudi('fine');
    },
    get inParlato() {
      return !!seg;
    },
    get rumore() {
      return rumore;
    },
  };
}
