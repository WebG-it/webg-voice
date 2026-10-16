// Pulizia del testo dettato (lib/pulizia.js) su casi italiani veri: il testo in ingresso e'
// quello che Whisper scrive davvero (maiuscola iniziale, punto a ogni pausa, punteggiatura
// sua attorno ai comandi detti a voce). Uso: npm run test:pulizia
import { creaSessione, comandoSegmento, eAllucinazione, applicaSostituzioni, inizioUltimaFrase, inizioUltimaParola } from '../src/lib/pulizia.js';

let ok = 0;
let ko = 0;
function uguale(nome, avuto, atteso) {
  if (avuto === atteso) ok++;
  else {
    ko++;
    console.log(`KO ${nome}\n   atteso: ${JSON.stringify(atteso)}\n   avuto:  ${JSON.stringify(avuto)}`);
  }
}

/** Un segmento solo, campo vuoto, piu' la chiusura. */
function uno(grezzo, o = {}) {
  const s = creaSessione(o);
  const r = s.segmento(grezzo, { prima: o.prima ?? '', pausa: 99 });
  return r.testo + (o.senzaChiusura ? '' : s.chiudi());
}

/** Piu' segmenti di fila, come li scriverebbe il campo. */
function seq(segmenti, o = {}) {
  const s = creaSessione(o);
  let campo = o.prima ?? '';
  for (const g of segmenti) {
    const [testo, pausa] = Array.isArray(g) ? g : [g, 2];
    const r = s.segmento(testo, { prima: campo, pausa });
    if (r.comando === 'cancellaFrase') campo = campo.slice(0, inizioUltimaFrase(campo)).replace(/\s+$/, '');
    else campo += r.testo;
  }
  return campo + s.chiudi();
}

// ---- esitazioni e riempitivi ----
uguale('ehm', uno('Ehm, domani chiamo Aldo.'), 'Domani chiamo Aldo.');
uguale('ehm in mezzo', uno('Domani, ehm, chiamo Aldo per il sito.'), 'Domani chiamo Aldo per il sito.');
uguale('uhm', uno('Allora, uhm, il preventivo è pronto.'), 'Il preventivo è pronto.');
uguale('cioè fra virgole', uno('Il sito, cioè, va rifatto.'), 'Il sito, va rifatto.');
uguale('cioè con significato', uno('Il prezzo, cioè dieci euro, va bene.'), 'Il prezzo, cioè dieci euro, va bene.');
uguale('diciamo all inizio', uno('Diciamo, la riunione è andata bene.'), 'La riunione è andata bene.');
uguale('diciamo che resta', uno('Diciamo che la riunione è andata bene.'), 'Diciamo che la riunione è andata bene.');
uguale('praticamente insomma', uno('Praticamente, insomma, il cliente ha detto di sì.'), 'Il cliente ha detto di sì.');
uguale('mmm', uno('Mmm, non so se domani riesco.'), 'Non so se domani riesco.');

// ---- ripetizioni ----
uguale('il il', uno('Ho mandato il il preventivo.'), 'Ho mandato il preventivo.');
uguale('gruppo ripetuto', uno('Ho fatto ho fatto la spesa.'), 'Ho fatto la spesa.');
uguale('che che', uno('Penso che che vada bene.'), 'Penso che vada bene.');
uguale('molto molto voluto', uno('È molto molto bello.'), 'È molto molto bello.');
uguale('piano piano voluto', uno('Piano piano ci arriviamo.'), 'Piano piano ci arriviamo.');
uguale('numeri ripetuti restano', uno('Il codice è 22 22.'), 'Il codice è 22 22.');

// ---- autocorrezioni ----
uguale('no anzi', uno('Ci vediamo martedì no anzi mercoledì.'), 'Ci vediamo mercoledì.');
uguale('no anzi con ripresa', uno('Ci vediamo alle cinque, no anzi alle sei.'), 'Ci vediamo alle sei.');
uguale('cioè volevo dire', uno('Scrivi a Marco, cioè volevo dire a Luca.'), 'Scrivi a Luca.');
uguale('scusa con ripresa', uno('Domani vado a Roma, scusa, a Milano.'), 'Domani vado a Milano.');
uguale('scusa normale', uno('Scusa il ritardo, arrivo subito.'), 'Scusa il ritardo, arrivo subito.');
uguale('scusa in mezzo normale', uno('Marco, scusa se ti scrivo tardi.'), 'Marco, scusa se ti scrivo tardi.');
uguale('anzi no numeri', uno('Il prezzo è dieci euro, anzi no, quindici euro.'), 'Il prezzo è quindici euro.');
uguale('anzi normale', uno('Non mi piace, anzi lo odio.'), 'Non mi piace, anzi lo odio.');
uguale('compra il pane', uno('Compra il latte, no scusa, il pane.'), 'Compra il pane.');

// ---- punteggiatura a voce ----
uguale('virgola punto', uno('Ciao Marco virgola come stai punto'), 'Ciao Marco, come stai.');
uguale('virgola con segni whisper', uno('Ciao Marco, virgola, come stai? Punto.'), 'Ciao Marco, come stai.');
uguale('punto interrogativo', uno('Ciao Marco virgola come stai punto interrogativo'), 'Ciao Marco, come stai?');
uguale('punto di domanda', uno('Vieni domani punto di domanda'), 'Vieni domani?');
uguale('punto esclamativo', uno('Che bello punto esclamativo'), 'Che bello!');
uguale('due punti', uno('Ecco la lista due punti latte e pane.'), 'Ecco la lista: latte e pane.');
uguale('due punti partita', uno('Abbiamo fatto due punti in classifica.'), 'Abbiamo fatto due punti in classifica.');
uguale('punto e virgola', uno('Il primo è pronto punto e virgola il secondo no.'), 'Il primo è pronto; il secondo no.');
uguale('punto come parola', uno('Il punto è che non abbiamo tempo.'), 'Il punto è che non abbiamo tempo.');
uguale('a che punto', uno('A che punto siamo con il sito?'), 'A che punto siamo con il sito?');
uguale('punto di vista', uno('Dal mio punto di vista va bene.'), 'Dal mio punto di vista va bene.');
uguale('punto in mezzo', uno('Ho finito punto domani riprendo.'), 'Ho finito. Domani riprendo.');
uguale('la virgola', uno('Togli la virgola dopo il nome.'), 'Togli la virgola dopo il nome.');
uguale('a capo', uno('Ciao Aldo virgola a capo ti scrivo per il sito.'), 'Ciao Aldo,\nTi scrivo per il sito.');
uguale('vai a capo', uno('Caro Marco, vai a capo. Ti mando il preventivo.'), 'Caro Marco,\nTi mando il preventivo.');
uguale('a capo del progetto', uno('Aldo è a capo del progetto.'), 'Aldo è a capo del progetto.');
uguale('nuovo paragrafo', uno('Fine della prima parte punto nuovo paragrafo la seconda parte.'), 'Fine della prima parte.\n\nLa seconda parte.');
uguale('parentesi', uno('Il sito apri parentesi WebG chiudi parentesi è pronto.'), 'Il sito (WebG) è pronto.');
uguale('virgolette', uno('Ha detto apri virgolette va bene chiudi virgolette.'), 'Ha detto "va bene".');

// ---- niente trattini come incisi ----
uguale('trattino inciso', uno('Il sito – quello nuovo – è pronto.'), 'Il sito, quello nuovo, è pronto.');
uguale('trattino in parola', uno('Mandami una e-mail.'), 'Mandami una e-mail.');

// ---- elenchi ----
uguale('primo secondo', seq(['Primo, comprare il latte.', 'Secondo, chiamare Aldo.', 'Terzo, aggiornare Joomla.']), '1. Comprare il latte.\n2. Chiamare Aldo.\n3. Aggiornare Joomla.');
uguale('secondo me', seq(['Secondo me il sito va bene.']), 'Secondo me il sito va bene.');
uguale('elenco puntato', seq(['Da comprare elenco puntato latte.', 'Pane.', 'Uova. Fine elenco.', 'Grazie.']), 'Da comprare\n- Latte.\n- Pane.\n- Uova.\nGrazie.');

// ---- maiuscole e segmenti ----
uguale('continuazione breve', seq([['Domani mattina chiamo Aldo.', 2], ['Per il sito di WebG.', 0.6]]), 'Domani mattina chiamo Aldo per il sito di WebG.');
uguale('frase nuova dopo pausa lunga', seq([['Domani chiamo Aldo.', 2], ['Poi sento Kian.', 1.8]]), 'Domani chiamo Aldo. Poi sento Kian.');
uguale('domanda resta', seq([['Vieni domani?', 2], ['Ti aspetto.', 0.5]]), 'Vieni domani? Ti aspetto.');
uguale('parola di legame', seq([['Ho parlato con.', 2], ['Aldo del sito.', 1.5]]), 'Ho parlato con Aldo del sito.');
uguale('in mezzo a una frase', uno('Il cliente vuole il modulo.', { prima: 'Ciao, ' }), 'il cliente vuole il modulo.');
uguale('dopo un punto', uno('Il cliente vuole il modulo.', { prima: 'Fatto.' }), ' Il cliente vuole il modulo.');
uguale('dopo una parola', uno('Il cliente vuole il modulo.', { prima: 'Ciao Marco' }), ' il cliente vuole il modulo.');
uguale('campo vuoto', uno('il cliente vuole il modulo'), 'Il cliente vuole il modulo');

// ---- comandi ----
uguale('cancella frase', comandoSegmento("Cancella l'ultima frase."), 'cancellaFrase');
uguale('cancella frase 2', comandoSegmento('cancella ultima frase'), 'cancellaFrase');
uguale('annulla', comandoSegmento('Annulla.'), 'annulla');
uguale('stop', comandoSegmento('Fine dettatura.'), 'stop');
uguale('non comando', comandoSegmento('Cancella la riunione di domani.'), null);
uguale('cancella in sequenza', seq(['Prima frase.', 'Seconda frase sbagliata.', "Cancella l'ultima frase.", 'Seconda giusta.']), 'Prima frase. Seconda giusta.');

// ---- allucinazioni ----
uguale('amara', eAllucinazione('Sottotitoli creati dalla comunità Amara.org'), true);
uguale('grazie per la visione', eAllucinazione('Grazie per la visione!'), true);
uguale('frase vera', eAllucinazione('Grazie per il preventivo, lo guardo domani.'), false);

// ---- dizionario personale ----
uguale('sostituzione', applicaSostituzioni('Ho scritto su recensioni di Marco.', [['recensioni di Marco', 'recensionidimarco']]), 'Ho scritto su recensionidimarco.');
uguale('sostituzione maiuscole', applicaSostituzioni('chiama web g domani', [['web g', 'WebG']]), 'chiama WebG domani');
uguale('sostituzione nella sessione', uno('Ho pubblicato su recensioni di Marco.', { sostituzioni: [['recensioni di Marco', 'recensionidimarco']] }), 'Ho pubblicato su recensionidimarco.');

// ---- utilita' ----
uguale('ultima frase', 'Uno. Due tre. Quattro cinque.'.slice(0, inizioUltimaFrase('Uno. Due tre. Quattro cinque.')), 'Uno. Due tre. ');
uguale('ultima parola', 'Uno due tre.'.slice(0, inizioUltimaParola('Uno due tre.')), 'Uno due ');

console.log(`\n${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
