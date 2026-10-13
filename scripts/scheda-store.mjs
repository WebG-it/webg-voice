// Rigenera i testi che contengono il nome dell'estensione, partendo dai modelli
// in store/template/, dal manifest (versione) e da src/_locales (nome e descrizione breve,
// unica fonte):
//   store/template/README.md  -> README.md
//   store/template/scheda.md  -> store/scheda.md
//   store/template/PRIVACY.md -> docs/PRIVACY.md
// Uso: npm run store
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RADICE, leggiManifest } from './versione.mjs';
import { BYTE_TOTALI } from '../src/lib/modelli.js';

const m = leggiManifest();
const messaggi = (l) => JSON.parse(readFileSync(join(RADICE, 'src', '_locales', l, 'messages.json'), 'utf8'));
const it = messaggi('it');
const en = messaggi('en');
const breve = it.nomeEstensione.message;
const BREVE_IT = it.descrizione.message;
const BREVE_EN = en.descrizione.message;
for (const [k, t] of [['italiano', BREVE_IT], ['inglese', BREVE_EN]]) {
  if ([...t].length > 132) throw new Error(`descrizione breve in ${k} troppo lunga: ${[...t].length} caratteri`);
}
const valori = {
  NOME: breve,
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
  ['store/template/README.md', 'README.md'],
  ['store/template/scheda.md', 'store/scheda.md'],
  ['store/template/PRIVACY.md', 'docs/PRIVACY.md'],
]) {
  writeFileSync(join(RADICE, a), riempi(readFileSync(join(RADICE, da), 'utf8')));
  console.log(`${a} aggiornato`);
}
