// Rigenera i testi che contengono il nome dell'estensione, partendo dai modelli
// in store/modelli/ e dal manifest (unica fonte di nome e versione):
//   store/modelli/README.md  -> README.md
//   store/modelli/scheda.md  -> store/scheda.md
//   store/modelli/PRIVACY.md -> docs/PRIVACY.md
// Uso: npm run store
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE, leggiManifest } from './versione.mjs';
import { BYTE_TOTALI } from '../src/lib/modelli.js';

const m = leggiManifest();
const breve = m.short_name || m.name;
const BREVE_IT = `Legge ad alta voce in italiano il testo selezionato, con una voce naturale che gira sul tuo computer. Gratis e offline.`;
const BREVE_EN = `Reads selected text aloud in Italian with a natural voice that runs on your computer. Free, offline, no account.`;
for (const [k, t] of [['italiano', BREVE_IT], ['inglese', BREVE_EN]]) {
  if ([...t].length > 132) throw new Error(`descrizione breve in ${k} troppo lunga: ${[...t].length} caratteri`);
}
const valori = {
  NOME: m.name,
  NOME_BREVE: breve,
  VERSIONE: m.version,
  MB: String(Math.round(BYTE_TOTALI / 1e6)),
  BREVE_IT,
  BREVE_EN,
  LUNG_BREVE_IT: String([...BREVE_IT].length),
  LUNG_BREVE_EN: String([...BREVE_EN].length),
};
const riempi = (t) => t.replace(/\{\{(\w+)\}\}/g, (x, k) => {
  if (!(k in valori)) throw new Error(`segnaposto sconosciuto ${x}`);
  return valori[k];
});
for (const [da, a] of [
  ['store/modelli/README.md', 'README.md'],
  ['store/modelli/scheda.md', 'store/scheda.md'],
  ['store/modelli/PRIVACY.md', 'docs/PRIVACY.md'],
]) {
  writeFileSync(join(RADICE, a), riempi(readFileSync(join(RADICE, da), 'utf8')));
  console.log(`${a} aggiornato`);
}
