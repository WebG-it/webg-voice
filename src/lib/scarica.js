// Download del modello a pezzi, con ripresa.
//
// Ogni file si scarica in parti da 16 MB con richieste Range; ogni parte finita
// si salva subito nell'archivio locale (IndexedDB). Se la connessione cade, o Chrome si chiude,
// il download riparte dall'ultima parte salvata. Se una sorgente non risponde si
// passa alla successiva (GitHub, poi Hugging Face). Alla fine i pezzi si
// riuniscono e si controlla l'impronta SHA-256: se non torna, si buttano e si
// prova la sorgente successiva.

import { FILE_REMOTI, BYTE_TOTALI, chiave, chiaveParte, fileRemoto } from './modelli.js';
import * as archivio from './archivio.js';

const PARTE = 16 * 1024 * 1024;
const TENTATIVI = 4;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sha256(byte) {
  const h = await crypto.subtle.digest('SHA-256', byte);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nParti = (f) => Math.ceil(f.byte / PARTE);
const limitiParte = (f, i) => [i * PARTE, Math.min(f.byte, (i + 1) * PARTE)];

/** Byte gia' presenti (file completi + parti salvate), per avanzamento e ripresa. */
export async function byteInCache() {
  let tot = 0;
  const completi = {};
  for (const [nome, f] of Object.entries(FILE_REMOTI)) {
    if (await archivio.esiste(chiave(nome))) {
      completi[nome] = true;
      tot += f.byte;
      continue;
    }
    completi[nome] = false;
    for (let i = 0; i < nParti(f); i++) {
      if (await archivio.esiste(chiaveParte(nome, i))) {
        const [a, b] = limitiParte(f, i);
        tot += b - a;
      }
    }
  }
  return { scaricati: tot, totale: BYTE_TOTALI, completi };
}

/** Scarica una parte con Range da una fonte; restituisce i byte. */
async function scaricaParte(url, a, b, suByte) {
  const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` }, cache: 'no-store' });
  if (r.status !== 206) {
    const e = new Error(r.status === 200 ? 'la sorgente non accetta download a pezzi' : `HTTP ${r.status}`);
    // file assente o sorgente non adatta: inutile riprovare, si passa alla prossima
    e.definitivo = r.status === 200 || (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429);
    throw e;
  }
  const atteso = b - a;
  const out = new Uint8Array(atteso);
  const lettore = r.body.getReader();
  let pos = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    if (pos + value.length > atteso) throw new Error('parte piu\' lunga del previsto');
    out.set(value, pos);
    pos += value.length;
    suByte(pos);
  }
  if (pos !== atteso) throw new Error(`parte incompleta (${pos} di ${atteso} byte)`);
  return out;
}

async function svuotaParti(nome, f) {
  for (let i = 0; i < nParti(f); i++) await archivio.cancella(chiaveParte(nome, i));
}

/**
 * Restituisce i byte del file `nome`, dalla cache o scaricandoli.
 * @param {string} nome chiave di FILE_REMOTI
 * @param {(p: object) => void} avanzamento riceve {scaricati, totale, file, fonte}
 * @param {number} base byte gia' contati prima di questo file (per il totale)
 */
const inCorso = new Map();
export function ottieni(nome, avanzamento, base = 0, totale = undefined) {
  // due richieste dello stesso file condividono lo stesso download
  if (!inCorso.has(nome)) {
    inCorso.set(nome, ottieniDavvero(nome, avanzamento, base, totale).finally(() => inCorso.delete(nome)));
  }
  return inCorso.get(nome);
}

// @@test-inizio
// solo test: le fonti si possono dirottare su un server locale (url originale -> url di prova)
let fontiProva = null;
export const impostaFontiProva = (f) => {
  fontiProva = f;
};
// @@test-fine

async function ottieniDavvero(nome, avanzamento, base, totale) {
  const f = fileRemoto(nome);
  if (!f) throw new Error(`file sconosciuto: ${nome}`);
  // il modello e la voce di base contano sul totale del primo download; una voce in piu' su se stessa;
  // i file della dettatura sul totale del modello scelto (passato da chi chiede)
  const TOT = totale ?? (FILE_REMOTI[nome] ? BYTE_TOTALI : f.byte);
  let fonti = f.fonti;
  // @@test-inizio
  if (fontiProva) fonti = fonti.map(fontiProva).filter(Boolean);
  // @@test-fine
  const pronto = await archivio.leggi(chiave(nome));
  if (pronto) {
    const b = new Uint8Array(await pronto.arrayBuffer());
    if (b.length === f.byte) return b;
    await archivio.cancella(chiave(nome));
  }

  const errori = [];
  for (const url of fonti) {
    const fonte = new URL(url).host;
    try {
      const n = nParti(f);
      // byte gia' salvati di questo file
      let fatti = 0;
      for (let i = 0; i < n; i++) {
        if (await archivio.esiste(chiaveParte(nome, i))) {
          const [a, b] = limitiParte(f, i);
          fatti += b - a;
        }
      }
      let ultimoAvviso = 0;
      for (let i = 0; i < n; i++) {
        if (await archivio.esiste(chiaveParte(nome, i))) continue;
        const [a, b] = limitiParte(f, i);
        let byte = null;
        for (let t = 1; t <= TENTATIVI && !byte; t++) {
          try {
            byte = await scaricaParte(url, a, b, (pos) => {
              const ora = Date.now();
              if (ora - ultimoAvviso > 200) {
                ultimoAvviso = ora;
                avanzamento({ scaricati: base + fatti + pos, totale: TOT, file: nome, fonte });
              }
            });
          } catch (e) {
            if (t === TENTATIVI || e.definitivo) throw e;
            avanzamento({ scaricati: base + fatti, totale: TOT, file: nome, fonte, riprovo: t, errore: String(e.message || e) });
            await dorme(1000 * 2 ** (t - 1));
          }
        }
        await archivio.scrivi(chiaveParte(nome, i), byte);
        fatti += b - a;
        avanzamento({ scaricati: base + fatti, totale: TOT, file: nome, fonte });
      }
      // riunisco e controllo
      const tutto = new Uint8Array(f.byte);
      for (let i = 0; i < n; i++) {
        const r = await archivio.leggi(chiaveParte(nome, i));
        tutto.set(new Uint8Array(await r.arrayBuffer()), limitiParte(f, i)[0]);
      }
      if ((await sha256(tutto)) !== f.sha256) {
        await svuotaParti(nome, f);
        throw new Error('impronta SHA-256 diversa da quella attesa');
      }
      await archivio.scrivi(chiave(nome), tutto);
      await svuotaParti(nome, f);
      return tutto;
    } catch (e) {
      errori.push(`${fonte}: ${e.message || e}`);
    }
  }
  const err = new Error(`download del ${f.nome} non riuscito (${errori.join('; ')})`);
  err.download = true;
  throw err;
}
