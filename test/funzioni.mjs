// Prove senza browser delle parti nuove della 1.2: sezioni dei testi lunghi,
// blocchi con continuazione e tetto, nome del file e tag ID3 dell'MP3.
// Uso: npm run test:funzioni
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { avviaEspeak } from '../src/lib/espeak.js';
import { creaFonemizzatore } from '../src/lib/fonemi.js';
import { creaFonemizzatoreMisto } from '../src/lib/pronuncia.js';
import { normalizza } from '../src/lib/normalizza.js';
import { blocchi, dividiSezioni, LIMITE_SEZIONI } from '../src/lib/testo.js';
import { nomeFile, tagId3 } from '../src/lib/mp3.js';
import { VOCI, voceValida, fileRemoto, FILE_REMOTI, FILE_VOCI, BYTE_TOTALI } from '../src/lib/modelli.js';

const qui = dirname(fileURLToPath(import.meta.url));
let ok = 0;
let no = 0;
const prova = (nome, cond, dettaglio = '') => {
  if (cond) ok++;
  else no++;
  console.log(`${cond ? 'OK ' : 'NO '} ${nome}${dettaglio ? `  (${dettaglio})` : ''}`);
};

// ---- sezioni ----
const base = readFileSync(join(qui, 'testo-lungo.txt'), 'utf8');
const lungo = Array(14).fill(base).join('\n');
const sez = dividiSezioni(lungo);
prova('sezioni: si ricompongono nel testo', sez.join('\n') === lungo.replace(/\r\n?/g, '\n'), `${sez.length} sezioni`);
prova('sezioni: la prima e\' corta', sez[0].length < 3000, `${sez[0].length} caratteri`);
prova('sezioni: le altre al massimo ~12.000 caratteri + un paragrafo', sez.slice(1).every((s) => s.length < 16000));
const unaRiga = 'Frase di prova abbastanza lunga per il test. '.repeat(400);
const sez2 = dividiSezioni(unaRiga);
prova('sezioni: un paragrafo enorme si taglia a fine frase, entro il tetto', sez2.length >= 2 && sez2[0].length <= 1200 && sez2.every((s) => /\.$/.test(s.trim())) && sez2.slice(1).every((s) => s.length <= 15000), sez2.map((s) => s.length).join(' + '));
{
  const enorme = 'Una frase di prova un po\' lunga che si ripete. '.repeat(1300); // circa 63.000 caratteri su una riga
  const s1 = dividiSezioni(enorme);
  prova('sezioni: riga da 63.000 caratteri entro il tetto', s1.every((s, i) => s.length <= (i ? 15000 : 1500)), `${enorme.length} caratteri: ${s1.length} sezioni, la piu' lunga ${Math.max(...s1.map((s) => s.length))}`);
  const voci = Array.from({ length: 3000 }, (_, i) => `voce numero ${i} senza punto finale`).join('\n');
  const s2 = dividiSezioni(voci);
  prova('sezioni: 3.000 righe senza punto entro il tetto', s2.every((s, i) => s.length <= (i ? 15000 : 1500)), `${s2.length} sezioni, la piu' lunga ${Math.max(...s2.map((s) => s.length))}`);
  const parole = 'parola '.repeat(3000);
  const s3 = dividiSezioni(parole);
  prova('sezioni: senza punteggiatura si taglia a parola', s3.every((s) => !/\S$/.test(s) || / parola$|^parola/.test(s)) && s3.join(' ').split(/\s+/).filter(Boolean).length === 3000, `${s3.length} sezioni`);
}
prova('sezioni: testo corto = una sezione', dividiSezioni('Ciao a tutti.').length === 1);
prova('sezioni: righe vuote o senza lettere scartate', dividiSezioni('\n\n  \n---\n').length === 0);

// ---- blocchi: preparazione a tappe e MP3 ----
const ve = join(qui, '..', 'vendor', 'espeak');
const clausole = await avviaEspeak({
  creaModulo: (await import('../vendor/espeak/espeak-ng.mjs')).default,
  wasm: new Uint8Array(readFileSync(join(ve, 'espeak-ng.wasm'))),
  indice: JSON.parse(readFileSync(join(ve, 'espeak-dati.json'), 'utf8')),
  dati: new Uint8Array(readFileSync(join(ve, 'espeak-dati.bin'))),
});
const fon = creaFonemizzatoreMisto(
  creaFonemizzatore(clausole, { rimuoviMarcatori: true }),
  creaFonemizzatore((t) => clausole(t, 'en-us'), { rimuoviMarcatori: true })
);
const lung = (s) => [...s].length;
let t = performance.now();
const tutti = blocchi(normalizza(lungo), fon, {});
const msTutto = performance.now() - t;
t = performance.now();
const primi = blocchi(normalizza(sez[0]), fon, { ultimaSezione: false });
const msPrima = performance.now() - t;
prova('tappe: la prima sezione si prepara in una frazione del tempo', msPrima < msTutto / 4, `${msPrima.toFixed(0)} ms contro ${msTutto.toFixed(0)} ms per ${lungo.split(/\s+/).length} parole`);
prova('tappe: l\'ultimo blocco della prima sezione ha la sua pausa', primi[primi.length - 1].pausa > 0);
const resto = sez.slice(1).flatMap((s, k, a) => blocchi(normalizza(s), fon, { limiteIniziale: LIMITE_SEZIONI, ultimaSezione: k === a.length - 1 }));
const media = (bb) => bb.slice(0, 8).reduce((s, x) => s + lung(x.fonemi), 0) / Math.min(8, bb.length);
const daCapo = blocchi(normalizza(sez[1]), fon, {});
prova('tappe: le sezioni dopo la prima non ripartono da blocchi corti', media(resto) > media(daCapo) * 1.3, `primi 8 blocchi: ${media(resto).toFixed(0)} fonemi contro ${media(daCapo).toFixed(0)} ripartendo da capo`);
prova('tappe: solo l\'ultimo blocco di tutto il testo ha pausa zero', resto[resto.length - 1].pausa === 0 && resto.slice(0, -1).every((b) => b.pausa > 0));
const fonTutti = tutti.map((b) => b.fonemi).join(' ').replace(/\s+/g, '');
const fonTappe = [...primi, ...resto].map((b) => b.fonemi).join(' ').replace(/\s+/g, '');
prova('tappe: stessi fonemi del testo preparato in una volta', fonTutti === fonTappe, `${tutti.length} blocchi contro ${primi.length + resto.length}`);
const mp3 = blocchi(normalizza(base), fon, { limiteIniziale: 160, bloccoMax: 160 });
const piuLungo = Math.max(...mp3.map((b) => lung(b.fonemi)));
prova('MP3: blocchi entro il tetto (salvo frasi senza punteggiatura)', piuLungo <= 200, `massimo ${piuLungo} fonemi, ${mp3.length} blocchi`);

// ---- pianificatore della lettura: blocchi composti durante la lettura ----
{
  const { pezzi, componiBlocco, pianoIniziale, regolaBlocco } = await import('../src/lib/testo.js');
  const testo1000 = Array(4).fill(base).join('\n');
  const tutti = pezzi(normalizza(testo1000), fon);
  prova('pezzi: stessi fonemi della preparazione a blocchi', tutti.map((p) => p.fonemi).join(' ').replace(/\s+/g, '') === blocchi(normalizza(testo1000), fon, {}).map((b) => b.fonemi).join(' ').replace(/\s+/g, ''));
  // simulazione: un motore che costa `fisso` + `perFonema` x n millisecondi, voce `audio` ms per fonema
  const simula = ({ fisso, perFonema, audio }) => {
    const lista = tutti.map((p) => ({ ...p }));
    let cur = 0;
    let orologio = 0; // tempo della sintesi (ms)
    let fineAudio = 0; // quando finisce l'audio in coda (ms)
    let primoSuono = null;
    const buchi = [];
    const confini = [];
    const attese = []; // pezzo dopo cui si e' aspettato (escluso il passaggio dopo il primo blocco)
    const n = [];
    while (cur < lista.length) {
      const primo = primoSuono === null;
      const margine = primo ? 0 : Math.max(0, fineAudio - orologio);
      const stima = { fisso, perFonema: perFonema * 1.1, audio };
      const lim = primo ? pianoIniziale(lista, stima).limite : regolaBlocco(margine / 1000, stima);
      const b = componiBlocco(lista, cur, lim, { primo });
      if (b.dividi) lista.splice(cur, 1, ...b.dividi);
      const k = lung(b.fonemi);
      orologio += fisso + perFonema * k;
      if (primo) {
        primoSuono = orologio;
        fineAudio = orologio;
      } else {
        confini.push(lista[cur - 1]);
        if (orologio > fineAudio) {
          buchi.push(orologio - fineAudio);
          if (confini.length > 1) attese.push(lista[cur - 1]);
        }
      }
      fineAudio = Math.max(fineAudio, orologio) + audio * k + b.pausa * 1000;
      n.push(k);
      cur = b.a;
    }
    return { primoSuono, buchi, confini, attese, n };
  };
  for (const [nome, k, primoMax, lenta] of [
    ['Corridoio carico, sintesi più lenta della voce', { fisso: 800, perFonema: 60, audio: 42 }, 4500, 5000],
    ['Corridoio oggi, sintesi pari alla voce', { fisso: 600, perFonema: 41, audio: 46 }, 4500, 3000],
    ['PC come il Corridoio del 13-10', { fisso: 450, perFonema: 33, audio: 46 }, 3500],
    ['PC veloce', { fisso: 250, perFonema: 20, audio: 46 }, 2000],
  ]) {
    const r = simula(k);
    const attesaAVirgola = r.attese.filter((x) => !x.fineFrase).length;
    const massima = r.buchi.length ? Math.max(...r.buchi.slice(1)) || 0 : 0;
    if (lenta) prova(`piano (${nome}): attese brevi dopo l'inizio (massimo ${lenta / 1000} s)`, massima <= lenta, `${r.n.length} blocchi, attesa massima dopo la prima ${(massima / 1000).toFixed(2)} s`);
    else prova(`piano (${nome}): nessuna attesa a una virgola dopo il primo blocco`, attesaAVirgola === 0, `${r.n.length} blocchi, fonemi ${r.n.slice(0, 6).join(', ')}…`);
    prova(`piano (${nome}): primo suono entro ${primoMax / 1000} s`, r.primoSuono <= primoMax, `${Math.round(r.primoSuono)} ms`);
    console.log(`     pause previste: ${r.buchi.length}, massima ${r.buchi.length ? (Math.max(...r.buchi) / 1000).toFixed(2) : 0} s, somma ${(r.buchi.reduce((a, x) => a + x, 0) / 1000).toFixed(2)} s`);
  }
}

// ---- a capo di riga: non sono paragrafi (prima: un blocco e una pausa per ogni riga) ----
{
  const { paragrafi, pezzi, componiBlocco } = await import('../src/lib/testo.js');
  const aRighe = 'Questo è un testo copiato da un PDF con le righe\nspezzate a metà frase, come capita spesso nei docu-\nmenti e nelle mail.\nSecondo paragrafo: inizia con la maiuscola.\nTitolo senza punto\nIl corpo del capitolo.\n\n1. prima voce\n2. seconda voce';
  const p = paragrafi(aRighe);
  prova('a capo: le righe di una frase si uniscono', p[0] === 'Questo è un testo copiato da un PDF con le righe spezzate a metà frase, come capita spesso nei documenti e nelle mail.', p[0]);
  prova('a capo: titoli, paragrafi ed elenchi restano separati', p.length === 6 && p[2] === 'Titolo senza punto' && p[4] === '1. prima voce', JSON.stringify(p.slice(1)));
  // tre paragrafi da articolo, ognuno spezzato a righe di circa 70 caratteri
  const tre = base.split('\n').slice(0, 3).map((par) => par.replace(/(.{60,75}?) /g, '$1\n')).join('\n\n');
  const righe = tre.split('\n').filter((r) => r.trim()).length;
  const lista = pezzi(normalizza(tre), fon);
  let cur = 0;
  const confini = [];
  while (cur < lista.length) {
    const b = componiBlocco(lista, cur, cur ? 300 : 60, { primo: cur === 0 });
    cur = b.a;
    confini.push(lista[cur - 1]);
  }
  prova('a capo: un testo a righe non fa un blocco per riga', confini.length < righe / 2 && confini.every((c) => c.fineFrase), `${righe} righe, ${confini.length} blocchi, tutti a fine frase`);
  const titolo = pezzi(normalizza('Titolo senza punto\nIl corpo del capitolo.'), fon);
  prova('a capo: un titolo senza punto riceve la pausa', /\.$/.test(titolo[0].fonemi), titolo[0].fonemi);
  const sez = dividiSezioni('Una frase che continua\nsulla riga dopo senza punto e poi finisce.\n'.repeat(30), 200, 400);
  prova('sezioni: con righe a fine periodo si taglia solo li\'', sez.every((s) => /[.!?…:;]$/.test(s.trim())), `${sez.length} sezioni`);
}

// ---- rilievi della controprova sulla 1.2.0 ----
{
  const { paragrafi, pezzi } = await import('../src/lib/testo.js');
  // 1. articolo: i paragrafi arrivano separati da una riga vuota (src/articolo.js)
  const articolo = ['Ricetta della torta', 'Come si prepara', 'farina', 'uova fresche', 'latte intero', 'Cosa dice il ministro', '«Non ci sono problemi», ha detto.', 'Risultati', '2024 è stato un anno record per le vendite.'].join('\n\n');
  const pa = paragrafi(articolo);
  prova('articolo: titoli, voci e citazioni restano paragrafi', pa.length === 9 && pa.includes('farina') && pa.includes('Come si prepara') && pa.includes('Risultati'), JSON.stringify(pa));
  const fonte = readFileSync(join(qui, '..', 'src', 'articolo.js'), 'utf8');
  prova('articolo: i paragrafi si uniscono con una riga vuota', /\.join\('\\n\\n'\)/.test(fonte));
  // 2. testo a righe fisse: una riga lunga senza punto continua anche se la dopo ha la maiuscola
  const righe = [
    'La riunione di ieri è andata bene e ha deciso di affidare il lavoro al collega',
    'Mario Rossi, che ha già seguito progetti simili per clienti in Italia e negli',
    'Stati Uniti. Il budget resta quello previsto a settembre dalla direzione generale',
    'e la consegna è fissata per la fine di novembre, salvo imprevisti tecnici.',
    'Prossimi passi',
    '- preparare il contratto',
    '- fissare la riunione di avvio',
  ].join('\n');
  const pr = paragrafi(righe);
  prova('a capo: nomi e "Stati Uniti" a inizio riga non spezzano la frase', pr[0].includes('al collega Mario Rossi') && pr[0].includes('negli Stati Uniti'), pr[0].slice(0, 120));
  prova('a capo: titolo e voci di elenco restano separati', pr.length === 4 && pr[1] === 'Prossimi passi' && pr[2] === '- preparare il contratto', JSON.stringify(pr.slice(1)));
  const fonP = pezzi(normalizza(righe), fon);
  const conPunto = fonP.filter((p) => p.fineParagrafo && /\.$/.test(p.fonemi)).length;
  prova('a capo: il punto si aggiunge solo ai titoli veri, non a meta\' frase', fonP.filter((p) => !p.fineParagrafo).every((p) => !/[a-zˈˌː]\.$/.test(p.fonemi) || p.fineFrase) && conPunto >= 2, `${fonP.length} pezzi`);
  // 3. trattini a fine riga
  const tr = (a, b) => paragrafi(`${'Il vento soffiava forte da giorni e le previsioni parlavano di una perturbazione da'} ${a}\n${b} che sarebbe durata almeno fino alla fine della settimana prossima, con piogge.\nUna seconda riga lunga quanto le altre serve solo a far riconoscere il testo a righe.\nE una terza riga di lunghezza simile chiude il paragrafo del nostro piccolo esempio.`)[0];
  prova('trattino: nord-est resta col trattino', tr('nord-', 'est').includes('nord-est'), tr('nord-', 'est').slice(80, 120));
  prova('trattino: ex-marito resta col trattino', tr('ex-', 'marito').includes('ex-marito'));
  prova('trattino: COVID-19 resta attaccato', tr('COVID-', '19').includes('COVID-19'));
  prova('trattino: la sillabazione si ricompone', tr('docu-', 'menti').includes('documenti'));
  prova('trattino: il trattino morbido sparisce', !paragrafi('una parola con trat­tino mor­\nbido').join(' ').includes('­') && paragrafi('una parola con trat­tino mor­\nbido').join(' ').includes('trattino morbido'));
  // 4. testo incollato: indirizzi ed elenchi brevi
  prova('a capo: civico e CAP restano separati', JSON.stringify(paragrafi('Via Roma 12\n10100 Torino')) === JSON.stringify(['Via Roma 12', '10100 Torino']));
  prova('a capo: un elenco di parole resta un elenco', paragrafi('Frutta\nmele\npere').length === 3);
}

// ---- regressioni della 1.2.1: false unioni di righe simili e prefissi troppo larghi ----
{
  const { paragrafi } = await import('../src/lib/testo.js');
  const titoli = [
    'Governo, approvata la manovra: nuove misure per le famiglie italiane',
    'Maltempo al Nord, allerta rossa in tre regioni per le piogge intense',
    'Calcio, la Juventus vince in trasferta e si porta al secondo posto',
    "Referendum, il quorum non raggiunto: l'affluenza si ferma al 38 per cento",
    "Economia, l'inflazione scende ancora ma i prezzi alimentari restano alti",
  ];
  prova('a capo: cinque titoli di giornale restano separati', paragrafi(titoli.join('\n')).length === 5);
  const voci = ['Prima', 'Seconda', 'Terza', 'Quarta'].map((x) => `${x} voce dell'elenco che e' piuttosto lunga e non finisce con punto`);
  prova('a capo: voci lunghe senza punto restano separate', paragrafi(voci.join('\n')).length === 4);
  const citazioni = [
    '«Una citazione lunga che chiude con le virgolette senza punto finale nel testo» disse',
    "«Un'altra citazione lunga che chiude con le virgolette senza punto finale» aggiunse",
    '«Una terza citazione lunga che chiude con le virgolette senza punto finale» concluse',
  ];
  prova('a capo: citazioni una per riga restano separate', paragrafi(citazioni.join('\n')).length === 3);
  const sill = paragrafi('Il pro-\ngetto della co-\nmunità e l\'au-\ntorità del pre-\nsidente sono eco-\nnomia e tele-\nvisione.')[0];
  prova('trattino: pro-, co-, pre-, eco-, tele- sono sillabazioni', sill === 'Il progetto della comunità e l\'autorità del presidente sono economia e televisione.', sill);
  prova('trattino: nord-est, centro-sud, ex-marito restano', paragrafi('La zona nord-\nest e il centro-\nsud, e il suo ex-\nmarito.')[0] === 'La zona nord-est e il centro-sud, e il suo ex-marito.');
  prova('a capo: riga che finisce con "di" o "il" continua', paragrafi('Il prezzo è di\n20 euro al mese.').length === 1 && paragrafi('La riunione è fissata per il\n12 ottobre alle 15.').length === 1);
  prova('a capo: una sigla come TO a fine riga non unisce', paragrafi('10100 Torino TO\nTel. 011 123456').length === 2);
  const mail = paragrafi('> Il presidente ha incontrato oggi il collega Mario Rossi per parlare di\n> economia, di Stati Uniti e dei nuovi accordi commerciali che riguardano\n> anche l\'Italia e la Germania. Nel frattempo il Governo ha annunciato\n> nuove misure per sostenere le famiglie.');
  prova('a capo: mail citata senza ">" dentro la frase', mail.length === 1 && !mail[0].includes('>'), mail[0].slice(0, 80));
}

// ---- nome del file ----
prova('nome: dal titolo', nomeFile('Sito vetrina nel 2026: a cosa serve e quando basta', 'x') === 'Sito vetrina nel 2026 a cosa serve e quando basta.mp3', nomeFile('Sito vetrina nel 2026: a cosa serve e quando basta', 'x'));
prova('nome: dall\'inizio del testo', nomeFile(null, 'Per cominciare conviene puntare su piante facili: basilico, prezzemolo, lattuga da taglio e ravanelli.') === 'Per cominciare conviene puntare su piante facili basilico.mp3', nomeFile(null, 'Per cominciare conviene puntare su piante facili: basilico, prezzemolo, lattuga da taglio e ravanelli.'));
prova('nome: niente caratteri vietati', !/[<>:"/\\|?*]/.test(nomeFile('A/B: "C" <D> | E? F*', '')), nomeFile('A/B: "C" <D> | E? F*', ''));
prova('nome: al massimo 80 caratteri', nomeFile('parola '.repeat(40), '').length <= 84);
prova('nome: nomi riservati di Windows', nomeFile('CON', '') === 'WebG Voice.mp3');
prova('nome: testo vuoto', nomeFile('', '') === 'WebG Voice.mp3');

// ---- tag ID3 ----
const tag = tagId3({ titolo: 'Perché sì', artista: 'WebG Voice, voce Sara', album: 'WebG Voice' });
const dim = (tag[6] << 21) | (tag[7] << 14) | (tag[8] << 7) | tag[9];
prova('ID3: intestazione e dimensione', String.fromCharCode(...tag.slice(0, 3)) === 'ID3' && tag[3] === 3 && dim === tag.length - 10, `${tag.length} byte`);
const tit2 = tag.indexOf(0x54); // "T" di TIT2
const len = new DataView(tag.buffer).getUint32(tit2 + 4);
const testoTit = String.fromCharCode(...new Uint16Array(tag.slice(tit2 + 13, tit2 + 10 + len).buffer));
prova('ID3: titolo in UTF-16 con accenti', testoTit === 'Perché sì', testoTit);

// ---- voci ----
prova('voci: Sara e Nicola, predefinita Sara', voceValida('nicola') === 'nicola' && voceValida('x') === 'sara' && voceValida(undefined) === 'sara' && voceValida('__proto__') === 'sara');
prova('voci: Nicola fuori dal primo download', !FILE_REMOTI.voceNicola && BYTE_TOTALI === FILE_REMOTI.voce.byte + FILE_REMOTI.modello.byte);
prova('voci: ogni voce ha il suo file con impronta', Object.values(VOCI).every((v) => fileRemoto(v.file) && /^[0-9a-f]{64}$/.test(fileRemoto(v.file).sha256)));
prova('voci: Nicola da GitHub, riserva Hugging Face', /github\.com\/WebG-it\/webg-voice\/releases\/download\/model-v1\/im_nicola\.bin$/.test(FILE_VOCI.voceNicola.fonti[0]) && /huggingface\.co/.test(FILE_VOCI.voceNicola.fonti[1]));

console.log(`\n${ok} su ${ok + no} riuscite`);
process.exit(no ? 1 : 0);
