# Test

- `npm run test:fonemi`: confronta i fonemi prodotti da eSpeak NG in WebAssembly con il riferimento
  di kokoro-onnx in Python (`riferimento-python.json`, corpus in `corpus.json`). Deve dare 44 su 44.
- `npm run test:testo`: mostra normalizzazione, fonemi e divisione in blocchi di `testo-lungo.txt`.

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

I test lanciano Chrome solo in modalità headless (nessuna finestra) e si fermano se non lo è.
`headless.mjs` con un profilo nuovo prova anche conferma, download, interruzione e ripresa;
le catture finiscono in `test/e2e/uscite/` (o in `USCITE`).
