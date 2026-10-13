// Funzioni comuni sulla versione. L'unica fonte e' src/manifest.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = join(RADICE, 'src', 'manifest.json');
export const CHANGELOG = join(RADICE, 'CHANGELOG.md');

export const leggiManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
export const versioneAttuale = () => leggiManifest().version;

export function analizza(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  if (!m) throw new Error(`versione non valida: "${v}" (serve X.Y.Z)`);
  return m.slice(1).map(Number);
}

/** < 0 se a < b, 0 se uguali, > 0 se a > b */
export function confronta(a, b) {
  const x = analizza(a);
  const y = analizza(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function successiva(v, tipo) {
  const [M, m, p] = analizza(v);
  if (tipo === 'major') return `${M + 1}.0.0`;
  if (tipo === 'minor') return `${M}.${m + 1}.0`;
  if (tipo === 'patch') return `${M}.${m}.${p + 1}`;
  throw new Error('tipo di versione: patch (correzioni), minor (funzioni) o major');
}

export function scriviVersione(v) {
  const testo = readFileSync(MANIFEST, 'utf8');
  const nuovo = testo.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`);
  writeFileSync(MANIFEST, nuovo);
}

/** true se il CHANGELOG (testo) ha una voce "## [X.Y.Z]" */
export const haVoce = (changelog, v) => new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\]`, 'm').test(changelog);
