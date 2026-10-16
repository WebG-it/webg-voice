// Scelta della voce del sistema e del motore della lettura, con elenchi di voci simulati per i
// sistemi su cui gira Chrome. Uso: npm run test:voci
import { scegliVoceSistema, vociItaliane } from '../src/lib/voci-sistema.js';
import { scegliMotore } from '../src/lib/motore-lettura.js';

let ok = 0;
let ko = 0;
const uguale = (nome, avuto, atteso) => {
  const a = JSON.stringify(avuto);
  const b = JSON.stringify(atteso);
  if (a === b) ok++;
  else {
    ko++;
    console.log(`KO ${nome}\n   atteso: ${b}\n   avuto:  ${a}`);
  }
};
const v = (name, lang, localService, def = false) => ({ name, lang, localService, voiceURI: name, default: def });

const SISTEMI = {
  // Chrome su Windows: voci del sistema locali, piu' le voci Google in rete
  windows: [v('Microsoft David - English (United States)', 'en-US', true, true), v('Microsoft Elsa - Italian (Italy)', 'it-IT', true), v('Microsoft Cosimo - Italian (Italy)', 'it-IT', true), v('Google italiano', 'it-IT', false)],
  // macOS: Alice, Federica e Luca (con varianti avanzate), piu' Google in rete
  macos: [v('Alice', 'it-IT', true), v('Federica (Enhanced)', 'it-IT', true), v('Luca', 'it-IT', true), v('Samantha', 'en-US', true, true), v('Google italiano', 'it-IT', false)],
  // Linux con speech-dispatcher: solo eSpeak in locale, Google in rete
  linux: [v('Italian (espeak-ng)', 'it', true), v('eSpeak Italian', 'it-IT', true), v('Google italiano', 'it-IT', false)],
  // ChromeOS: voci di sistema locali
  chromeos: [v('Chrome OS italiano 1', 'it-IT', true), v('Chrome OS italiano 2', 'it-IT', true), v('Google italiano', 'it-IT', false)],
  // nessuna voce italiana
  nessuna: [v('Samantha', 'en-US', true), v('Daniel', 'en-GB', true)],
};

uguale('windows: voce locale', scegliVoceSistema(SISTEMI.windows, { soloLocali: true }), { nome: 'Microsoft Elsa - Italian (Italy)', uri: 'Microsoft Elsa - Italian (Italy)', lang: 'it-IT', locale: true });
uguale('macos: variante avanzata', scegliVoceSistema(SISTEMI.macos, { soloLocali: true }).nome, 'Federica (Enhanced)');
uguale('linux: eSpeak non e una voce decente', scegliVoceSistema(SISTEMI.linux, { soloLocali: true }), null);
uguale('linux: in rete solo se ammesso', scegliVoceSistema(SISTEMI.linux), { nome: 'Google italiano', uri: 'Google italiano', lang: 'it-IT', locale: false });
uguale('chromeos: voce locale', scegliVoceSistema(SISTEMI.chromeos, { soloLocali: true }).nome, 'Chrome OS italiano 1');
uguale('nessuna voce italiana', scegliVoceSistema(SISTEMI.nessuna), null);
uguale('preferita dall utente', scegliVoceSistema(SISTEMI.windows, { preferita: 'Microsoft Cosimo - Italian (Italy)' }).nome, 'Microsoft Cosimo - Italian (Italy)');
uguale('elenco per le opzioni (locali prima)', vociItaliane(SISTEMI.windows).map((x) => x.locale), [true, true, false]);

const elsa = scegliVoceSistema(SISTEMI.windows, { soloLocali: true });
const remota = scegliVoceSistema(SISTEMI.linux);
uguale('auto: mai misurato -> qualita massima', scegliMotore({ rtf: undefined, voceSistema: elsa }).motore, 'massima');
uguale('auto: veloce -> qualita massima', scegliMotore({ rtf: 0.7, voceSistema: elsa }).motore, 'massima');
uguale('auto: carico -> bilanciata da scaricare', scegliMotore({ rtf: 1.0, voceSistema: elsa }), { motore: 'massima', motivo: 'bilanciata in arrivo', scaricaBilanciata: true });
uguale('auto: carico, bilanciata pronta', scegliMotore({ rtf: 1.0, voceSistema: elsa, bilanciataPronta: true }).motore, 'bilanciata');
uguale('auto: lento -> voce del sistema', scegliMotore({ rtf: 1.3, voceSistema: elsa, bilanciataPronta: true }).motore, 'sistema');
uguale('auto: lento senza voce locale -> resta Kokoro', scegliMotore({ rtf: 1.3, voceSistema: remota, bilanciataPronta: true }).motore, 'bilanciata');
uguale('auto: lento senza nessuna voce -> resta Kokoro', scegliMotore({ rtf: 1.3, voceSistema: null, bilanciataPronta: true }).motore, 'bilanciata');
uguale('scelta: sistema senza voci -> Kokoro', scegliMotore({ preferenza: 'sistema', voceSistema: null }).motore, 'massima');
uguale('scelta: qualita massima anche se lento', scegliMotore({ preferenza: 'massima', rtf: 1.5, voceSistema: elsa }).motore, 'massima');

console.log(`\n${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
