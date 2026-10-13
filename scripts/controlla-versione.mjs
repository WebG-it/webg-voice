// Controllo del pre-commit (.githooks/pre-commit). Blocca il commit se:
// 1. cambia qualcosa sotto src/, estensione/ o vendor/ e la versione in
//    src/manifest.json non e' salita rispetto all'ultimo commit;
// 2. manca la voce "## [X.Y.Z]" della nuova versione in CHANGELOG.md;
// 3. estensione/ non e' stata ricostruita con la stessa versione di src/;
// 4. un file in commit contiene percorsi personali di un computer.
// Regola del progetto: ogni modifica, anche minima, fa avanzare la versione
// (patch per le correzioni, minor per le funzioni nuove).
import { execFileSync } from 'node:child_process';
import { confronta, haVoce } from './versione.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const prova = (...a) => {
  try {
    return git(...a);
  } catch {
    return null;
  }
};

const errori = [];
const inCommit = git('diff', '--cached', '--name-only', '--diff-filter=ACMRD').split('\n').filter(Boolean);
const tocca = inCommit.filter((f) => /^(src|estensione|vendor)\//.test(f));

if (tocca.length) {
  const nuovo = JSON.parse(prova('show', ':src/manifest.json') || '{}').version;
  const vecchioTesto = prova('show', 'HEAD:src/manifest.json');
  const vecchio = vecchioTesto ? JSON.parse(vecchioTesto).version : null;
  if (!nuovo) errori.push('src/manifest.json non ha una versione.');
  else {
    if (vecchio && confronta(nuovo, vecchio) <= 0) {
      errori.push(
        `Hai modificato ${tocca.length} file del codice ma la versione e' ancora ${vecchio}.\n` +
          '   Usa "npm run release -- patch \\"cosa hai corretto\\"" (o minor per una funzione nuova).'
      );
    }
    const changelog = prova('show', ':CHANGELOG.md') || '';
    if (!haVoce(changelog, nuovo)) errori.push(`In CHANGELOG.md manca la voce "## [${nuovo}]".`);
    const costruita = prova('show', ':estensione/manifest.json');
    if (!costruita || JSON.parse(costruita).version !== nuovo) {
      errori.push(`estensione/ non e' allineata alla versione ${nuovo}: lancia "npm run build" e aggiungi estensione/.`);
    }
  }
}

// Nessun percorso personale nel repository pubblico
const SOSPETTI = /[A-Za-z]:\\Users\\[^\\\s"']+|\/(?:c|mnt\/c)\/Users\/[^/\s"']+|\/home\/[a-z][\w-]*\/|AppData\\Local\\Temp/;
for (const f of inCommit) {
  if (/\.(wasm|bin|png|jpg|zip|onnx)$/i.test(f)) continue;
  const testo = prova('show', `:${f}`);
  if (testo && SOSPETTI.test(testo)) errori.push(`${f} contiene un percorso personale (${testo.match(SOSPETTI)[0]}).`);
}

if (errori.length) {
  console.error('\nCommit bloccato:\n - ' + errori.join('\n - ') + '\n');
  process.exit(1);
}
