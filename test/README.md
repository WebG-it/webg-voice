# Test

- `npm run test:fonemi`: confronta i fonemi prodotti da eSpeak NG in WebAssembly con il riferimento
  di kokoro-onnx in Python (`riferimento-python.json`, corpus in `corpus.json`). Deve dare 44 su 44.
- `npm run test:testo`: mostra normalizzazione, fonemi e divisione in blocchi di `testo-lungo.txt`.
- `npm run test:funzioni`: senza browser, le parti nuove della 1.2: divisione dei testi lunghi in
  sezioni (stessi fonemi della preparazione in una volta), blocchi dell'MP3, nome del file e tag
  ID3, catalogo delle voci. Deve dare tutto OK.

- `npm run test:pulizia`: pulizia italiana del testo dettato (`src/lib/pulizia.js`) su casi veri,
  scritti come li scrive Whisper: esitazioni, ripetizioni, autocorrezioni («no anzi», «cioè volevo
  dire», «scusa»), punteggiatura e a capo a voce, elenchi, maiuscole fra un segmento e l'altro,
  comandi, allucinazioni, dizionario. Deve dare tutto OK.

## Computer lenti (1.5)

- `npm run test:voci`: scelta della voce del sistema con elenchi simulati (Windows, macOS, Linux con
  solo eSpeak, ChromeOS, nessuna voce italiana) e scelta automatica del motore della lettura.
- `test/e2e/motore.mjs` (profilo con la voce): computer lento, voce del sistema con avviso, pausa e
  ripresa; computer carico, Kokoro subito e Bilanciata scaricata in sottofondo per la lettura dopo;
  computer veloce, qualità massima.
- `test/e2e/banco-kokoro.mjs` (`KOKORO=<cartella con i model*.onnx>`): rapporto sintesi/tempo reale
  delle varianti di Kokoro su WebAssembly e WebGPU, con o senza `test/e2e/stress-cpu.mjs`, e l'audio
  dello stesso paragrafo per confrontarle a orecchio.
- Le prove della lettura impostano «Qualità massima» (con `MOTORE_AUTO=1` restano in automatico).

## Dettatura

```
npm run build:test && npm i --no-save puppeteer
CHROME=<chrome for testing> node test/dettatura/e2e.mjs
CHROME=<...> MODELLI=<cartella modelli> AUDIO=<wav 16 kHz> [MODELLO=normale|leggero|qualita] node test/dettatura/e2e.mjs
CHROME=<...> MODELLI=<...> AUDIO=<cartella wav> PROVE=... node test/dettatura/banco.mjs
CHROME=<...> node test/dettatura/web-speech.mjs
```

- `e2e.mjs`, parte 1 (senza modelli): pagine locali con input, textarea alla React (con il
  tracciatore del valore di React), editor che gestisce da sé `beforeinput` (come ProseMirror e
  Lexical), contenteditable semplice, campo in un riquadro e pagina senza campi (casella). Il testo
  "dettato" passa dal service worker alla pagina come nell'uso vero; controlla pulizia, maiuscole,
  a capo, elenchi, «cancella l'ultima frase» e «annulla».
- `e2e.mjs`, parte 2 (con `MODELLI` e `AUDIO`): microfono finto di Chrome che suona il wav,
  modello servito da un server locale con richieste a pezzi (stessi byte e impronte dei file
  pubblicati), misura del computer, download e misura del modello, Ctrl+Spazio simulato, testo nel campo,
  latenze dalla fine del parlato al testo. `MODELLI` è una cartella con `small/`, `base/`, `turbo/`
  come su Hugging Face (`tokenizer.json`, `onnx/...`), con gli encoder ritoccati da
  `scripts/accorcia-encoder.py` (`encoder_model_int8_corto.onnx`, `encoder_model_q4f16_corto.onnx`).
- `banco.mjs`: Whisper in ONNX Runtime Web (WebAssembly e WebGPU) su una pagina locale, senza
  estensione: tempi di mel, encoder e decoder per file, rapporto col tempo reale e testo.
- `web-speech.mjs`: `SpeechRecognition.available` per l'italiano sul dispositivo.
- `silenzio.mjs`: niente testo inventato. Silenzio, ventola e tastiera di 30 s non devono scrivere
  niente; una frase seguita da 25 s di silenzio scrive solo la frase e la dettatura si ferma da sola
  dopo 20 s. I wav si generano con lo script Python in fondo a questo file.
- `download-vero.mjs`: download da internet (nessun server locale): i file devono arrivare dalla
  release GitHub `dettatura-v1`, con l'encoder corto.
- `riserva.mjs`: chi ha l'encoder originale (riserva) passa da solo a quello corto alla volta dopo.
- `stato-salvato.mjs`: aggiornamento da una versione precedente. Mette in `chrome.storage.local` lo
  stato lasciato dalla 1.3.2-1.3.3 (quello letto nel profilo di Marco: misura vecchia, modello Leggero
  proposto e mai scaricato) e apre la pagina della dettatura: deve partire, rispondere sul microfono e
  preselezionare il modello consigliato. Gira anche con Chrome stabile (`CHROME=.../chrome.exe`).
  Con la 1.3.4 dava KO (errore di sintassi in dettatura.js); la build ora controlla la sintassi di ogni script.

## Test end-to-end (solo Chrome headless)

Gli hook usati dai test (`globalThis.__test` nell'offscreen, richieste a URL arbitrari e
svuotamento dell'archivio nel worker, risultati della diagnostica) stanno fra i commenti
`@@test-inizio` e `@@test-fine` e vengono **tolti dalla build di produzione** (`npm run build`,
cartella `estensione/`). I test usano la build di test:

```
npm run build:test                 # crea estensione-test/ (ignorata da git, nome con "(TEST)")
npm i --no-save puppeteer tinymce@7 codemirror@5
npx @puppeteer/browsers install chrome@stable   # Chrome for Testing: Chrome di marca non carica estensioni da riga di comando
CHROME=<percorso di chrome> PROFILO=<cartella profilo nuova> node test/e2e/headless.mjs
CHROME=<percorso di chrome> PROFILO=<cartella profilo con voce gia' scaricata> node test/e2e/iframe.mjs
```

Funzioni della 1.2 (articolo intero, MP3, voce Nicola), con un profilo che ha già il modello:

```
CHROME=<percorso di chrome> PROFILO=<profilo con la voce> USCITE=<cartella> node test/e2e/funzioni.mjs
FASI=estrazione,nessuno,menu,nicola,mp3,annulla,concorrenza,lungo   # quali fasi (predefinito: tutte)
PAGINE=url1,url2  LUNGO=url  VELOCITA=1.5                           # pagine vere da provare
```

Estrae l'articolo da pagine vere (webg.it, scossaditerremoto.it, Wikipedia, Il Post, Corriere,
ANSA) e ne salva il testo, prova il "!" sulle pagine senza articolo, Alt+Q senza selezione, il
menu e il pulsante del popup, scarica e usa Nicola, crea MP3 dal popup e li controlla con ffprobe e
ffmpeg (durata, formato, decodifica), annulla un MP3, misura la lettura mentre si crea un MP3 e
legge tutto un articolo lungo campionando la memoria dell'offscreen ogni minuto. Esiti in
`risultati-funzioni.json`. Se Chrome tiene in cache il service worker di una build precedente con
la stessa versione, cancellare la cartella `Default/Service Worker` del profilo di prova (il
modello sta in IndexedDB e resta).

I test lanciano Chrome solo in modalità headless (nessuna finestra) e si fermano se non lo è.
`headless.mjs` con un profilo nuovo prova anche conferma, download, interruzione e ripresa;
le catture finiscono in `test/e2e/uscite/` (o in `USCITE`).

## Misure di velocità (build di produzione)

```
npm run build -- --uscita <cartella>      # build di produzione fuori da estensione/
EXT=<cartella> CHROME=<chrome> PROFILO=<profilo> TESTO=<file.txt> VELOCITA=1.1 PANNELLO=1 \
  NOME=<nome> node test/e2e/misura-lettura.mjs
```

`misura-lettura.mjs` non usa agganci di test: legge lo stato che l'offscreen pubblica. Riporta
isolamento e thread davvero attivi, primo suono a freddo, a pannello aperto e a caldo, e su un
testo lungo letto tutto le pause fra un blocco e il successivo (numero, massima, media su tutti i
passaggi, totale) con il rapporto col tempo reale. Il carico del PC cambia di minuto in minuto:
per confrontare due versioni si alternano le misure (A, B, A, B) e si guarda il rapporto di ogni
giro. Non usare `estensione/` come cartella di prova se è caricata in un Chrome in uso: Chrome
legge i file dell'offscreen dal disco quando lo apre.

`banco.mjs` (build di test) misura il costo della sintesi per lunghezza del blocco e ne ricava
costo fisso e costo per fonema (`FILI=n` per provare un altro numero di thread, `OPZIONI=<json>`
per opzioni di sessione di ONNX Runtime). `parallelo.mjs` prova più motori in parallelo
(`PROVE=1x8,2x4,...`) con la memoria occupata.

### Wav per `silenzio.mjs`

```python
import numpy as np, wave
sr = 16000
rng = np.random.default_rng(1)
def scrivi(nome, x):
    w = wave.open(nome, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
def rosa(n, amp):
    b = np.cumsum(rng.standard_normal(n)); b = b - np.convolve(b, np.ones(400) / 400, 'same')
    return b / np.abs(b).max() * amp
t = np.arange(30 * sr) / sr
scrivi('silenzio30.wav', np.zeros(30 * sr))
scrivi('ventola30.wav', rosa(30 * sr, 0.04) + 0.01 * np.sin(2 * np.pi * 120 * t))
x = rosa(30 * sr, 0.005); pos = 0
while pos < 30 * sr - 800:
    pos += int(sr / rng.uniform(6, 9)); n = int(0.006 * sr)
    c = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.0015 * sr)) * rng.uniform(0.15, 0.35)
    x[pos:pos + n] += c[:len(x[pos:pos + n])]
scrivi('tastiera30.wav', x)
# frase_silenzio.wav: 1 s di silenzio, una frase a 16 kHz, 25 s di silenzio con un filo di rumore
```

## Prove della 1.3.0

```
CHROME=<chrome> PROFILO=<profilo con la voce> USCITE=<cartella> node test/e2e/novita130.mjs
CHROME=<chrome> PROFILO=<profilo con la voce> [VARIANTI=<json>] node test/e2e/freddo.mjs
```

`novita130.mjs` prova su pagine locali l'evidenziazione della frase in lettura (articolo e
selezione, scorrimento verso una frase fuori vista, nessun riporto dopo la rotella dell'utente,
opzione spenta, area di testo senza evidenziazione), "Rileggi la bozza" su selezione, area di
testo, riquadro modificabile e testo incollato (elenco nel pannello, colori nella pagina, lettura
a 0,15 in meno e una frase per blocco) e la partenza a freddo con la scorciatoia. `iframe.mjs`
prova "Rileggi la bozza" anche dentro TinyMCE. `freddo.mjs` misura le fasi del caricamento del
motore e la memoria dei processi a motore fermo, con varianti di opzioni di sessione.
