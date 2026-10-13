// Dizionario di pronuncia in chrome.storage.sync, spezzato in piu' chiavi.
// Limiti di Chrome: 8192 byte per chiave (nome + JSON del valore, in UTF-8),
// 102400 byte in tutto, 512 chiavi. Formato: "dizionario_indice" = { versione: 2, parti: N }
// e "dizionario_0" ... "dizionario_{N-1}" = array di coppie [scritto, lettura].
// Il formato della 1.1.0 (una sola chiave "dizionario") si legge e si migra al primo salvataggio.

export const MAX_VOCI = 300;
export const MAX_CARATTERI = 100;
const PER_CHIAVE = 8192;
const TOTALE = 102400;
const INDICE = 'dizionario_indice';
const VECCHIA = 'dizionario';
const parte = (i) => `dizionario_${i}`;
const byte = (s) => new TextEncoder().encode(s).length;
const peso = (chiave, valore) => byte(chiave) + byte(JSON.stringify(valore));

export const vocePulita = (v) =>
  Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0].trim() && v[1].trim()
    ? [v[0].trim().slice(0, MAX_CARATTERI), v[1].trim().slice(0, MAX_CARATTERI)]
    : null;

/** Legge il dizionario: formato a piu' chiavi, oppure quello vecchio a chiave unica. */
export async function leggiDizionario(area = chrome.storage.sync) {
  const { [INDICE]: indice, [VECCHIA]: vecchio } = await area.get([INDICE, VECCHIA]);
  if (indice && Number.isInteger(indice.parti)) {
    const chiavi = Array.from({ length: indice.parti }, (_, i) => parte(i));
    const tutto = chiavi.length ? await area.get(chiavi) : {};
    return chiavi.flatMap((k) => (Array.isArray(tutto[k]) ? tutto[k] : [])).map(vocePulita).filter(Boolean);
  }
  return Array.isArray(vecchio) ? vecchio.map(vocePulita).filter(Boolean) : [];
}

/** Divide le voci in parti che stanno sotto il limite per chiave. */
export function dividi(voci) {
  const parti = [];
  let cur = [];
  for (const v of voci) {
    const prova = [...cur, v];
    if (cur.length && peso(parte(parti.length), prova) > PER_CHIAVE - 64) {
      parti.push(cur);
      cur = [v];
    } else cur = prova;
  }
  if (cur.length) parti.push(cur);
  return parti;
}

/**
 * Salva il dizionario. Restituisce { salvate } oppure { errore } con il limite reale.
 * Nessuna scrittura se non ci sta: il dizionario precedente resta com'era.
 */
export async function salvaDizionario(voci, area = chrome.storage.sync) {
  const pulite = voci.map(vocePulita).filter(Boolean);
  if (pulite.length > MAX_VOCI) {
    return { errore: `Troppe voci: ${pulite.length}. Il massimo è ${MAX_VOCI}.` };
  }
  const parti = dividi(pulite);
  const valori = { [INDICE]: { versione: 2, parti: parti.length } };
  parti.forEach((p, i) => (valori[parte(i)] = p));
  const totale = Object.entries(valori).reduce((s, [k, v]) => s + peso(k, v), 0);
  if (totale > TOTALE - 512) {
    return {
      errore: `Il dizionario occupa ${(totale / 1024).toFixed(1)} KB ma la sincronizzazione di Chrome ne concede ${TOTALE / 1024} in tutto: togli o accorcia alcune voci.`,
    };
  }
  const { [INDICE]: prima } = await area.get(INDICE);
  await area.set(valori);
  // via le parti avanzate di un dizionario piu' lungo e il formato vecchio
  const avanzate = [];
  for (let i = parti.length; i < ((prima && prima.parti) || 0); i++) avanzate.push(parte(i));
  await area.remove([...avanzate, VECCHIA]);
  return { salvate: pulite.length, kb: +(totale / 1024).toFixed(1), chiavi: parti.length + 1 };
}
