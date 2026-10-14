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
prova('sezioni: un paragrafo enorme in testa si taglia a fine frase', sez2.length === 2 && sez2[0].length < 1400 && /\.$/.test(sez2[0]), sez2.map((s) => s.length).join(' + '));
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
  const { pezzi, componiBlocco, pianoIniziale, limiteDaMargine, virgoleConsentite } = await import('../src/lib/testo.js');
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
      let lim = primo ? pianoIniziale(lista, stima).limite : limiteDaMargine(margine / 1000, stima);
      if (!primo && !virgoleConsentite(stima)) lim = Math.min(lim, 160);
      const b = componiBlocco(lista, cur, lim, { primo, virgole: virgoleConsentite(stima) });
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
  for (const [nome, k, primoMax] of [
    ['Corridoio oggi, sintesi pari alla voce', { fisso: 600, perFonema: 41, audio: 46 }, 4500],
    ['PC come il Corridoio del 13-10', { fisso: 450, perFonema: 33, audio: 46 }, 3500],
    ['PC veloce', { fisso: 250, perFonema: 20, audio: 46 }, 2000],
  ]) {
    const r = simula(k);
    const attesaAVirgola = r.attese.filter((x) => !x.fineFrase).length;
    prova(`piano (${nome}): nessuna attesa a una virgola dopo il primo blocco`, attesaAVirgola === 0, `${r.n.length} blocchi, fonemi ${r.n.slice(0, 6).join(', ')}…`);
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
  const sez = dividiSezioni(('Una frase lunga che continua\nsulla riga dopo senza punto ' + 'e ancora parole '.repeat(80) + 'fine.\n').repeat(3), 200, 400);
  prova('sezioni: mai tagliate a meta\' frase', sez.every((s) => /[.!?…:;]$/.test(s.trim())), `${sez.length} sezioni`);
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
