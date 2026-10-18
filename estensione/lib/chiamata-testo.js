// Trascrizione di una call: righe con orario, due fonti ("Io" il microfono, "Call" l'audio della
// scheda), unione dei pezzi vicini, eliminazione dell'eco della call captata dal microfono e
// scrittura del file Markdown. Nessun accesso a Chrome: si prova con test/call/testo.mjs.

export const FONTE_IO = 'Io';
export const FONTE_CALL = 'Call';

/** 83000 -> "01:23", 3723000 -> "1:02:03" */
export function formattaOra(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const due = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${due(m)}:${due(r)}` : `${due(m)}:${due(r)}`;
}

const parole = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Quante parole di `a` ci sono anche in `b`, sul totale delle parole di `a` (0..1). */
export function somiglianza(a, b) {
  const A = new Set(parole(a));
  const B = new Set(parole(b));
  if (!A.size || !B.size) return 0;
  let comuni = 0;
  for (const p of A) if (B.has(p)) comuni++;
  return comuni / A.size;
}

// l'eco arriva insieme alla voce della call (con un ritardo di frazioni di secondo): serve una vera
// sovrapposizione di tempo. Chi ripete la frase dell'altro subito dopo ("ok, giovedi' alle cinque") non e' eco.
const ECO_MARGINE_MS = 1500;
const ECO_SOVRAPPOSIZIONE = 0.5;
const ECO_SOGLIA = 0.6;
const ECO_MIN_PAROLE = 3;
const UNISCI_PAUSA_MS = 3000;
const UNISCI_MAX = 700;

export function creaTrascrizione() {
  /** @type {{fonte: string, inizio: number, fine: number, testo: string}[]} */
  const righe = [];
  const lacune = []; // { inizio, fine }: tratti che il computer non ha fatto in tempo a trascrivere

  /** Il microfono capta anche la call dagli altoparlanti: la riga "Io" che ripete una riga "Call" vicina e' eco. */
  function senzaEco(tutte) {
    const call = tutte.filter((r) => r.fonte === FONTE_CALL);
    return tutte.filter((r) => {
      if (r.fonte !== FONTE_IO || parole(r.testo).length < ECO_MIN_PAROLE) return true;
      const durata = Math.max(1, r.fine - r.inizio);
      return !call.some((c) => {
        const sovrapposto = Math.min(r.fine, c.fine + ECO_MARGINE_MS) - Math.max(r.inizio, c.inizio - ECO_MARGINE_MS);
        return sovrapposto >= ECO_SOVRAPPOSIZIONE * durata && somiglianza(r.testo, c.testo) >= ECO_SOGLIA;
      });
    });
  }

  function unite() {
    const ordinate = senzaEco(righe)
      .slice()
      .sort((a, b) => a.inizio - b.inizio);
    const out = [];
    for (const r of ordinate) {
      const u = out[out.length - 1];
      if (u && u.fonte === r.fonte && r.inizio - u.fine < UNISCI_PAUSA_MS && u.testo.length + r.testo.length < UNISCI_MAX) {
        u.testo += ` ${r.testo}`;
        u.fine = Math.max(u.fine, r.fine);
      } else out.push({ ...r });
    }
    for (const l of lacune) out.push({ fonte: null, inizio: l.inizio, fine: l.fine, testo: null });
    return out.sort((a, b) => a.inizio - b.inizio);
  }

  return {
    aggiungi({ fonte, inizio, fine, testo }) {
      const t = String(testo || '').replace(/\s+/g, ' ').trim();
      if (!t || (fonte !== FONTE_IO && fonte !== FONTE_CALL)) return;
      righe.push({ fonte, inizio: Math.max(0, Math.round(inizio)), fine: Math.max(0, Math.round(fine)), testo: t });
    },
    lacuna(inizio, fine) {
      lacune.push({ inizio: Math.max(0, Math.round(inizio)), fine: Math.max(0, Math.round(fine)) });
    },
    get righe() {
      return righe.length;
    },
    get lacune() {
      return lacune.length;
    },
    unite,
    /** Per tenere una copia nell'archivio del browser: se qualcosa si ferma, la trascrizione non si perde. */
    esporta() {
      return { righe: righe.slice(), lacune: lacune.slice() };
    },
    importa(d) {
      if (!d || !Array.isArray(d.righe)) return;
      for (const r of d.righe) this.aggiungi(r);
      for (const l of Array.isArray(d.lacune) ? d.lacune : []) this.lacuna(l.inizio, l.fine);
    },
  };
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const due = (n) => String(n).padStart(2, '0');
const dataLunga = (d) => `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
const ora = (d) => `${due(d.getHours())}:${due(d.getMinutes())}`;

/**
 * Il file Markdown. `inizio` e `fine` sono Date; `host` il sito della scheda (senza percorso:
 * l'indirizzo completo puo' contenere il codice della stanza).
 */
export function markdown({ trascrizione, titolo, host, inizio, fine, versione, senzaMicrofono = false, microfonoPerso = false, finePrematura = '', scartati = 0 }) {
  const durata = Math.max(0, fine.getTime() - inizio.getTime());
  const min = Math.max(1, Math.round(durata / 60000));
  const righe = trascrizione.unite();
  const out = [];
  out.push(`# ${String(titolo || 'Call').replace(/\s+/g, ' ').trim() || 'Call'}`);
  out.push('');
  out.push(`- Data: ${dataLunga(inizio)}, dalle ${ora(inizio)} alle ${ora(fine)} (${min} min)`);
  if (host) out.push(`- Dove: ${host}`);
  out.push(`- Trascritta in locale sul computer con WebG Voice ${versione || ''} (Parakeet TDT 0.6B v3), senza inviare l'audio a nessuno.`.replace('  ', ' '));
  out.push(
    senzaMicrofono
      ? '- Fonti: solo "Call", l\'audio della scheda. Il microfono non era disponibile.'
      : '- Fonti: "Io" è il microfono di chi ha trascritto, "Call" è l\'audio della scheda (tutti gli altri insieme). I singoli partecipanti non sono distinti.' +
          (microfonoPerso ? ' Il microfono si è scollegato a metà: da lì in poi c\'è solo "Call".' : '')
  );
  if (scartati) out.push(`- Frammenti incerti scartati: ${scartati} (rumore o voci sovrapposte).`);
  if (finePrematura) out.push(`- Fine anticipata: ${finePrematura}.`);
  out.push('');
  if (!righe.length) {
    out.push('_Nessun parlato riconosciuto._');
    out.push('');
  }
  for (const r of righe) {
    if (r.fonte === null) out.push(`_[${formattaOra(r.inizio)}] Tratto non trascritto: il computer era troppo occupato._`);
    else out.push(`**[${formattaOra(r.inizio)}] ${r.fonte}:** ${r.testo}`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export const CARTELLA_PREDEFINITA = 'WebG Voice';

/**
 * Sottocartella dei download scelta dall'utente. Chrome salva solo dentro la cartella dei download:
 * niente percorsi assoluti, niente risalite («..»), niente caratteri non ammessi nei nomi. Vuota o non
 * valida, torna alla predefinita (il nome dell'estensione).
 */
export function cartellaValida(testo) {
  const pezzi = String(testo ?? '')
    .split(/[\\/]+/)
    .map((p) => p.replace(/[\u0000-\u001f<>:"|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').replace(/^[. ]+/g, '').slice(0, 60).trim())
    .filter((p) => p && p !== '.' && p !== '..');
  return pezzi.length ? pezzi.slice(0, 3).join('/') : CARTELLA_PREDEFINITA;
}

/** Nome del file: titolo della scheda e data, senza caratteri che i nomi dei file non ammettono. */
export function nomeFileChiamata(titolo, quando) {
  let t = String(titolo || '')
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ')
    .replace(/[.\s]+$/g, '')
    .replace(/^[.\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 80) t = t.slice(0, 80).trim();
  if (!t) t = 'Call';
  const d = quando;
  return `${t} ${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())} ${due(d.getHours())}-${due(d.getMinutes())}.md`;
}
