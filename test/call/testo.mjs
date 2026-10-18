// Prova senza browser di src/lib/chiamata-testo.js e src/lib/parakeet.js (parti pure).
//   node test/call/testo.mjs
import { creaTrascrizione, markdown, nomeFileChiamata, formattaOra, somiglianza, cartellaValida } from '../../src/lib/chiamata-testo.js';
import { componiTesto, leggiVocabolario } from '../../src/lib/parakeet.js';

let ok = 0;
let ko = 0;
const controlla = (nome, cond, dettaglio = '') => {
  if (cond) ok++;
  else {
    ko++;
    console.log('KO ', nome, dettaglio);
  }
};
const uguali = (nome, a, b) => controlla(nome, a === b, `atteso ${JSON.stringify(b)}, trovato ${JSON.stringify(a)}`);

// ore
uguali('ora 0', formattaOra(0), '00:00');
uguali('ora 83 s', formattaOra(83000), '01:23');
uguali('ora 1h', formattaOra(3723000), '1:02:03');
uguali('ora negativa', formattaOra(-5), '00:00');

// somiglianza
controlla('somiglianza uguale', somiglianza('Ciao a tutti, come va', 'ciao a tutti come va') === 1);
controlla('somiglianza diversa', somiglianza('domani alle cinque', 'il preventivo del sito') === 0);
controlla('somiglianza vuota', somiglianza('', 'ciao') === 0);

// unione dei pezzi vicini della stessa fonte, ordine per orario
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 1000, fine: 3000, testo: 'Buongiorno a tutti.' });
  t.aggiungi({ fonte: 'Call', inizio: 3500, fine: 5000, testo: 'Iniziamo con il primo punto.' });
  t.aggiungi({ fonte: 'Io', inizio: 8000, fine: 9000, testo: 'Buongiorno.' });
  t.aggiungi({ fonte: 'Call', inizio: 20000, fine: 22000, testo: 'Passiamo al secondo.' });
  const u = t.unite();
  uguali('unione: righe', u.length, 3);
  uguali('unione: testo unito', u[0].testo, 'Buongiorno a tutti. Iniziamo con il primo punto.');
  uguali('unione: ordine', u.map((r) => r.fonte).join(','), 'Call,Io,Call');
}
// fonti diverse non si uniscono anche se vicine, e l'ordine e' per orario
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Io', inizio: 2000, fine: 3000, testo: 'Si certo.' });
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 1500, testo: 'Mi senti bene?' });
  const u = t.unite();
  uguali('ordine per orario', u.map((r) => r.fonte).join(','), 'Call,Io');
}
// eco: il microfono ripete la call
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 10000, fine: 14000, testo: 'Il preventivo per il sito è di tremila euro.' });
  t.aggiungi({ fonte: 'Io', inizio: 10300, fine: 14200, testo: 'preventivo per il sito è di tremila euro' });
  t.aggiungi({ fonte: 'Io', inizio: 20000, fine: 22000, testo: 'Va bene, ci penso e ti rispondo domani.' });
  const u = t.unite();
  uguali('eco: tolta', u.filter((r) => r.fonte === 'Io').length, 1);
  uguali('eco: resta la risposta vera', u.find((r) => r.fonte === 'Io').testo, 'Va bene, ci penso e ti rispondo domani.');
}
// chi ripete la frase dell'altro subito dopo non e' eco
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 3000, testo: 'Ci vediamo giovedì alle cinque in ufficio.' });
  t.aggiungi({ fonte: 'Io', inizio: 3600, fine: 6600, testo: 'Ci vediamo giovedì alle cinque in ufficio.' });
  uguali('ripetizione subito dopo: tenuta', t.unite().filter((r) => r.fonte === 'Io').length, 1);
}
// una risposta breve uguale a una parola della call non e' eco
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 3000, testo: 'Confermi la data di giovedì?' });
  t.aggiungi({ fonte: 'Io', inizio: 3200, fine: 3800, testo: 'Confermo giovedì.' });
  uguali('risposta breve: tenuta', t.unite().filter((r) => r.fonte === 'Io').length, 1);
}
// la stessa frase detta lontano nel tempo non e' eco
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 3000, testo: 'Ci vediamo domani alle cinque in ufficio.' });
  t.aggiungi({ fonte: 'Io', inizio: 60000, fine: 63000, testo: 'Ci vediamo domani alle cinque in ufficio.' });
  uguali('frase ripetuta dopo un minuto: tenuta', t.unite().filter((r) => r.fonte === 'Io').length, 1);
}
// testi vuoti e fonti sconosciute
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 1000, testo: '   ' });
  t.aggiungi({ fonte: 'Altro', inizio: 0, fine: 1000, testo: 'ciao' });
  uguali('vuoti scartati', t.righe, 0);
}
// esporta e importa
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 0, fine: 1000, testo: 'Uno due tre.' });
  t.lacuna(5000, 9000);
  const u = creaTrascrizione();
  u.importa(JSON.parse(JSON.stringify(t.esporta())));
  uguali('importa: righe', u.righe, 1);
  uguali('importa: lacune', u.lacune, 1);
}
// markdown
{
  const t = creaTrascrizione();
  t.aggiungi({ fonte: 'Call', inizio: 1000, fine: 3000, testo: 'Buongiorno.' });
  t.aggiungi({ fonte: 'Io', inizio: 4000, fine: 5000, testo: 'Buongiorno a te.' });
  t.lacuna(70000, 75000);
  const md = markdown({ trascrizione: t, titolo: 'Riunione  Cliente\n- Meet', host: 'meet.google.com', inizio: new Date(2026, 9, 18, 10, 30), fine: new Date(2026, 9, 18, 11, 25), versione: '1.6.0' });
  controlla('md: titolo su una riga', md.startsWith('# Riunione Cliente - Meet\n'), md.slice(0, 60));
  controlla('md: data', md.includes('18 ottobre 2026, dalle 10:30 alle 11:25 (55 min)'));
  controlla('md: host senza percorso', md.includes('- Dove: meet.google.com'));
  controlla('md: riga call', md.includes('**[00:01] Call:** Buongiorno.'));
  controlla('md: riga io', md.includes('**[00:04] Io:** Buongiorno a te.'));
  controlla('md: lacuna', md.includes('_[01:10] Tratto non trascritto'));
  controlla('md: versione', md.includes('WebG Voice 1.6.0'));
  controlla('md: finisce con a capo', md.endsWith('\n') && !md.endsWith('\n\n'));
  const vuoto = markdown({ trascrizione: creaTrascrizione(), titolo: '', inizio: new Date(2026, 9, 18, 10, 0), fine: new Date(2026, 9, 18, 10, 0), versione: '1.6.0' });
  controlla('md vuoto', vuoto.includes('# Call') && vuoto.includes('_Nessun parlato riconosciuto._'));
  const senzaMic = markdown({ trascrizione: t, titolo: 'x', inizio: new Date(), fine: new Date(), versione: '1', senzaMicrofono: true });
  controlla('md senza microfono', senzaMic.includes('Il microfono non era disponibile'));
}
// nome del file
uguali('nome file', nomeFileChiamata('Riunione: cliente/Torino?', new Date(2026, 9, 18, 9, 5)), 'Riunione cliente Torino 2026-10-18 09-05.md');
uguali('nome file vuoto', nomeFileChiamata('', new Date(2026, 9, 18, 9, 5)), 'Call 2026-10-18 09-05.md');
uguali('nome file solo simboli', nomeFileChiamata('???', new Date(2026, 9, 18, 9, 5)), 'Call 2026-10-18 09-05.md');
controlla('nome file lungo', nomeFileChiamata('a'.repeat(300), new Date(2026, 0, 1, 0, 0)).length < 110);
controlla('nome file senza punto finale', !/\.\.md$/.test(nomeFileChiamata('Titolo...', new Date())));

// cartella scelta dall'utente
uguali('cartella vuota', cartellaValida(''), 'WebG Voice');
uguali('cartella non data', cartellaValida(undefined), 'WebG Voice');
uguali('cartella semplice', cartellaValida('Call clienti'), 'Call clienti');
uguali('sottocartelle', cartellaValida('Lavoro/Call\\2026'), 'Lavoro/Call/2026');
uguali('niente risalite', cartellaValida('../../Windows/System32'), 'Windows/System32');
uguali('niente percorso assoluto', cartellaValida('C:\\Users\\x\\Desktop'), 'C/Users/x');
uguali('solo punti', cartellaValida('..'), 'WebG Voice');
uguali('caratteri vietati', cartellaValida('a<b>:c|d?e'), 'a b  c d e'.replace(/\s+/g, ' '));
uguali('al massimo tre livelli', cartellaValida('a/b/c/d/e'), 'a/b/c');
controlla('nome lungo tagliato', cartellaValida('x'.repeat(200)).length <= 60);

// vocabolario e testo
{
  const v = leggiVocabolario('<unk> 0\n<|pnc|> 5\n▁Ciao 100\n▁a 101\n▁tutti 102\n. 103\n<blk> 104\n');
  uguali('vocabolario: blank ultimo', v.length - 1, 104);
  uguali('testo da token', componiTesto(v, [100, 101, 102, 103]), 'Ciao a tutti.');
  uguali('token speciali saltati', componiTesto(v, [5, 100, 104, 0]), 'Ciao');
  uguali('id sconosciuto', componiTesto(v, [9999, 100]), 'Ciao');
}

console.log(`${ok} OK, ${ko} KO`);
process.exit(ko ? 1 : 0);
