# {{NOME_BREVE}}

**{{NOME}}**: estensione per Chrome di [WebG](https://www.webg.it) che legge ad alta voce, in
italiano, il testo che selezioni in una pagina. La voce (Sara, del modello Kokoro-82M) gira tutta
sul tuo computer: niente account, niente abbonamenti, niente testo inviato a servizi esterni.
Dopo il primo download funziona anche senza connessione.

## Installare

Dal Chrome Web Store (quando sarà pubblicata) oppure, per provarla dal codice:

1. Scarica questo repository (o lo zip di una release) e apri `chrome://extensions`.
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella `estensione`.

Al primo utilizzo l'estensione chiede conferma e scarica la voce, circa {{MB}} MB, una volta
sola. Il download va a pezzi e, se si interrompe, riparte da dove era arrivato.

## Usare

- Seleziona del testo e premi **Alt+Maiusc+L**, oppure tasto destro → **Leggi ad alta voce**.
- Senza testo selezionato, la stessa scorciatoia mette in pausa e fa ripartire la lettura.
- Durante la lettura compare in basso a destra una barretta con pausa, stop e velocità.
- Il popup dell'estensione legge un testo incollato e regola la velocità (da 0,7 a 1,5).
- La scorciatoia si cambia da `chrome://extensions/shortcuts`; c'è anche "Ferma la lettura",
  senza tasto predefinito.
- **Diagnostica** (dalle opzioni dell'estensione o dal popup): misura la velocità della sintesi
  su quel computer e dice se ci sono rischi di pause.

## Come funziona

Testo → piccola normalizzazione (date, orari, migliaia, unità, abbreviazioni) → eSpeak NG 1.52.0
in WebAssembly → fonemi IPA (identici a quelli di kokoro-onnx in Python, verificato su un corpus di
prova) → modello Kokoro-82M con ONNX Runtime Web (WebAssembly multithread) e lo stile della voce
`if_sara` → audio a 24 kHz in un documento offscreen, così la lettura continua anche a popup chiuso.
I testi lunghi si leggono a blocchi: mentre uno suona, i successivi si preparano in anticipo.

Il modello si scarica dalla release `model-v1` di questo repository; se GitHub non risponde, dalla
stessa revisione su Hugging Face. In entrambi i casi l'estensione controlla l'impronta SHA-256.

## Privacy

L'estensione non raccoglie e non invia dati: il testo resta sul computer. Le sole connessioni
servono a scaricare i file del modello. Dettagli in [docs/PRIVACY.md](docs/PRIVACY.md).

## Sviluppo

```
npm install            # dipendenze e hook di controllo dei commit
npm run build          # ricostruisce estensione/ da src/
npm run test:fonemi    # confronta i fonemi con il riferimento di kokoro-onnx
npm run release -- patch "cosa è cambiato"   # nuova versione: changelog, build, zip, tag
npm run store          # rigenera testi della scheda store, privacy e questo README
```

Ogni modifica, anche minima, fa avanzare la versione (patch per le correzioni, minor per le
funzioni). La versione vive solo in `src/manifest.json`; l'hook `.githooks/pre-commit` blocca i
commit che toccano il codice senza versione nuova e senza voce in `CHANGELOG.md`.
Il nome dell'estensione vive solo in `src/manifest.json` (`name` e `short_name`): i testi in
`store/`, `docs/PRIVACY.md` e questo README si rigenerano da `store/modelli/` con `npm run store`.

## Contatti

WebG, https://www.webg.it, info@webg.it. Per segnalazioni e richieste usa le
[issue di GitHub](https://github.com/WebG-it/webg-voice/issues).

## Licenza

GPL-3.0-or-later (vedi `LICENSE`), perché l'estensione include eSpeak NG. Modello Kokoro-82M di
hexgrad con licenza Apache-2.0, ONNX Runtime Web con licenza MIT: dettagli in `THIRD_PARTY.md`.

---

## English

**{{NOME_BREVE}}** is a Chrome extension by [WebG](https://www.webg.it) that reads selected text
aloud in Italian with a natural neural voice (Kokoro-82M, voice Sara) running entirely on your
computer. No account, no subscription, no text sent anywhere; after a one-time download of about
{{MB}} MB it works offline. Select text and press **Alt+Shift+L**, or right-click → *Leggi ad alta
voce*. Licensed under GPL-3.0-or-later (it bundles eSpeak NG); see `THIRD_PARTY.md` for the
Kokoro (Apache-2.0) and ONNX Runtime (MIT) notices. Contact: info@webg.it or GitHub issues.
