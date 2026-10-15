# Test

- `npm run test:fonemi`: confronta i fonemi prodotti da eSpeak NG in WebAssembly con il riferimento
  di kokoro-onnx in Python (`riferimento-python.json`, corpus in `corpus.json`). Deve dare 44 su 44.
- `npm run test:testo`: mostra normalizzazione, fonemi e divisione in blocchi di `testo-lungo.txt`.
- `npm run test:funzioni`: senza browser, le parti nuove della 1.2: divisione dei testi lunghi in
  sezioni (stessi fonemi della preparazione in una volta), blocchi dell'MP3, nome del file e tag
  ID3, catalogo delle voci. Deve dare tutto OK.

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
