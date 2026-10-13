// Nuova versione: npm run release -- <patch|minor|major> "nota" ["altra nota" ...]
//   1. alza la versione in src/manifest.json (unica fonte)
//   2. aggiunge la voce in CHANGELOG.md con le note
//   3. ricostruisce estensione/ e crea dist/webg-voice-X.Y.Z.zip per lo store
//   4. commit "Versione X.Y.Z" e tag vX.Y.Z (niente push)
// Con --senza-bump usa la versione attuale (serve solo per la prima, 1.0.0).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RADICE, CHANGELOG, versioneAttuale, successiva, scriviVersione, haVoce } from './versione.mjs';
import { costruisci } from './build.mjs';
import { zippa } from './zip.mjs';

const arg = process.argv.slice(2);
const senzaBump = arg.includes('--senza-bump');
const parole = arg.filter((a) => !a.startsWith('--'));
const tipo = senzaBump ? null : parole.shift();
const note = parole;
const git = (...a) => execFileSync('git', a, { cwd: RADICE, stdio: 'inherit' });

if (!senzaBump && !['patch', 'minor', 'major'].includes(tipo)) {
  console.error('Uso: npm run release -- patch|minor|major "nota" ["nota" ...]');
  process.exit(1);
}
const v = senzaBump ? versioneAttuale() : successiva(versioneAttuale(), tipo);
let changelog = readFileSync(CHANGELOG, 'utf8');
if (!haVoce(changelog, v)) {
  if (!note.length) {
    console.error(`Serve almeno una nota per la voce ${v} del CHANGELOG.`);
    process.exit(1);
  }
  const oggi = new Date().toISOString().slice(0, 10);
  const voce = `## [${v}] - ${oggi}\n\n${note.map((n) => `- ${n}`).join('\n')}\n\n`;
  const i = changelog.search(/^## \[/m);
  changelog = i < 0 ? `${changelog.trimEnd()}\n\n${voce}` : changelog.slice(0, i) + voce + changelog.slice(i);
  writeFileSync(CHANGELOG, changelog);
}
if (!senzaBump) scriviVersione(v);
// testi con nome e versione (README, scheda store, privacy)
execFileSync(process.execPath, [join(RADICE, 'scripts', 'scheda-store.mjs')], { stdio: 'inherit' });

costruisci();
mkdirSync(join(RADICE, 'dist'), { recursive: true });
const zip = join(RADICE, 'dist', `webg-voice-${v}.zip`);
const n = zippa(join(RADICE, 'estensione'), zip);
console.log(`dist/webg-voice-${v}.zip: ${n} file`);

git('add', '-A', 'src', 'estensione', 'vendor', 'CHANGELOG.md', 'README.md', 'store', 'docs');
git('commit', '-m', `Versione ${v}`);
git('tag', '-a', `v${v}`, '-m', `Versione ${v}`);
console.log(`Fatto: commit e tag v${v}. Lo zip da caricare sul Chrome Web Store e' in dist/.`);
