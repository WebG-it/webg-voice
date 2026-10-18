// Filtro dei frammenti inventati (src/lib/chiamata-filtro.js), su casi veri di una call di 18 minuti:
// le soglie sono state tarate su quei 173 segmenti. node test/call/filtro.mjs
import { valutaSegmento } from '../../src/lib/chiamata-filtro.js';

let ok = 0;
let ko = 0;
const prova = (testo, lp, durata, tieni) => {
  const r = valutaSegmento({ testo, logprobMedio: lp, durata });
  if (r.tieni === tieni) ok++;
  else {
    ko++;
    console.log('KO ', JSON.stringify(testo), lp, durata, '-> tieni', r.tieni, r.motivo || '');
  }
};
// inventati: si scartano
prova('You know?', -0.83, 0.78, false);
prova('I smoke.', -0.81, 1.36, false);
prova('Quoi.', -1.2, 1.0, false);
prova('Hullo I', -1.5, 1.78, false);
prova('It\'s meat.', -0.93, 3.5, false);
prova('No, but give me a button back.', -0.63, 3.46, false);
prova('Uh', -0.6, 3.9, false);
prova('', 0, 1, false);
// veri: si tengono
prova('Okay.', -0.08, 0.8, true);
prova('Yeah.', -0.2, 0.9, true);
prova('Vado?', -0.32, 3.3, true);
prova('Password.', -0.52, 1.1, true);
prova('Allora.', -0.62, 1.2, true);
prova('Faccia? Vado.', -0.5, 1.2, true);
prova('Quindi in altri network, fare keep log e disable cache.', -0.19, 6.6, true);
prova('Okay, in via così aspetta, vabbè, Warpus plug in.', -0.33, 3.9, true);
// una frase lunga e sicura in inglese si tiene (call in inglese)
prova('I think we should send the quote to the client before Friday.', -0.1, 4.5, true);
// segmenti lunghi con sicurezza media bassa ma non da scarto
prova('Non so se commandica.', -0.45, 6.2, true);
console.log(`${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
