// Rigenera i testi che contengono il nome dell'estensione, partendo dai modelli
// in store/template/, dal manifest (versione) e da src/_locales (nome e descrizione breve,
// unica fonte):
//   store/template/README.md  -> README.md
//   store/template/README.en.md -> README.en.md
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
// data della versione dal CHANGELOG ("## [X.Y.Z] - AAAA-MM-GG"): la stessa in tutti i testi
const voceLog = readFileSync(join(RADICE, 'CHANGELOG.md'), 'utf8').match(new RegExp(`^## \\[${m.version.replace(/\./g, '\\.')}\\] - (\\d{4})-(\\d{2})-(\\d{2})`, 'm'));
if (!voceLog) throw new Error(`nel CHANGELOG manca la data della ${m.version}`);
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const [, aa, mm, gg] = voceLog;
const valori = {
  DATA: `${gg}-${mm}-${aa}`,
  DATA_ISO: `${aa}-${mm}-${gg}`,
  DATA_LUNGA: `${Number(gg)} ${MESI[Number(mm) - 1]} ${aa}`,
  DATA_EN: `${MONTHS[Number(mm) - 1]} ${Number(gg)}, ${aa}`,
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
  ['store/template/README.en.md', 'README.en.md'],
  ['store/template/scheda.md', 'store/scheda.md'],
  ['store/template/PRIVACY.md', 'docs/PRIVACY.md'],
]) {
  writeFileSync(join(RADICE, a), riempi(readFileSync(join(RADICE, da), 'utf8')));
  console.log(`${a} aggiornato`);
}
