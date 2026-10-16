# WebG Voice

**WebG Voice**: estensione per Chrome di [WebG](https://www.webg.it) che legge ad alta voce, in
italiano, il testo che selezioni in una pagina o un articolo intero, e lo salva anche in MP3. Le
voci (Sara e Nicola, del modello Kokoro-82M) girano tutte sul tuo computer: niente account, niente
abbonamenti, niente testo inviato a servizi esterni. Dopo il primo download funziona anche senza
connessione.

Dalla 1.3 scrive anche **sotto dettatura**: premi **Alt+S** in un campo di qualsiasi pagina, parli,
e il testo arriva nel campo già pulito (punteggiatura, a capo, elenchi, niente «ehm»). Anche il
riconoscimento (Whisper di OpenAI) gira sul tuo computer: l'audio non esce.

## Installare

Dal Chrome Web Store (quando sarà pubblicata) oppure, per provarla dal codice:

1. Scarica questo repository (o lo zip di una release) e apri `chrome://extensions`.
2. Attiva **Modalità sviluppatore** (in alto a destra).
3. **Carica estensione non pacchettizzata** e scegli la cartella `estensione`.

Al primo avvio l'estensione scarica il modello vocale (circa 326 MB) una volta sola, in
sottofondo: l'avanzamento si vede nell'icona e nel popup. Se chiedi una lettura prima della fine,
parte appena il modello è pronto. Il download va a pezzi e, se si interrompe, riprende da solo da
dove era arrivato. Su una connessione a consumo (risparmio dati o rete cellulare) non parte da solo:
al primo uso compare un pulsante per scaricarlo.

## Usare

- Seleziona del testo e premi **Alt+Q**, oppure tasto destro → **Leggi ad alta voce**.
  **Alt+Q** di nuovo mette in pausa e riprende, **Alt+W** ferma la lettura.
  Su Mac i tasti predefiniti sono **Control+Q** e **Control+W**: Option+Q su Mac scrive il
  carattere "œ" e non va bene come scorciatoia.
- **Articolo intero**: senza selezione, **Alt+Q** legge tutto l'articolo della pagina (titolo e
  testo, senza menu, pubblicità, commenti e banner dei cookie, con Mozilla Readability). Lo stesso
  fanno il tasto destro sulla pagina → **Leggi tutto l'articolo** e il pulsante **Leggi l'articolo**
  del popup. Se la pagina non ha un articolo riconoscibile, l'icona mostra "!" e il popup lo spiega.
  Gli articoli lunghi (migliaia di parole) partono in pochi secondi: il testo si prepara a sezioni
  mentre la prima suona, e l'audio già ascoltato non resta in memoria.
- Durante la lettura compare in basso a destra una barretta con pausa, stop e velocità.
- Il popup dell'estensione legge un testo incollato e regola la velocità (da 0,7 a 1,5); con il
  campo vuoto, **Leggi** legge il testo selezionato nella pagina o, se non c'è, l'articolo.
- **Voce**: Sara o Nicola, dal popup o dalle opzioni; la scelta resta ricordata. Nicola si scarica
  la prima volta che la scegli (mezzo MB, una volta sola).
- **Scarica MP3** nel popup crea un file MP3 (mono, 24 kHz, 64 kbps, circa mezzo MB al minuto)
  del testo incollato, della selezione o dell'articolo, con il titolo dell'articolo come nome del
  file. Tutto in locale; barra di avanzamento e Annulla nel popup, avanzamento anche sull'icona.
  Si può chiudere il popup: quando è pronto l'icona mostra "MP3" e riaprendo il popup il file si
  salva nella cartella dei download. Se intanto parte una lettura, ha la precedenza.
- Funziona anche dentro gli editor: aree di testo, campi, editor nei riquadri (iframe) della stessa
  pagina come TinyMCE di Joomla e WordPress, editor di codice come CodeMirror.
- Sulle pagine interne di Chrome (chrome://, Chrome Web Store, visualizzatore PDF, file locali senza
  permesso) Chrome non lascia leggere la selezione alle estensioni: l'icona mostra "!" per qualche
  secondo e il popup spiega di incollare il testo. Lo stesso "!" compare se premi la scorciatoia
  senza aver selezionato niente.
- Se un'altra estensione usa già gli stessi tasti, Chrome lascia la scorciatoia vuota: il popup lo
  segnala con il link per impostarla.
- Nell'editor TinyMCE il tasto destro apre il menu dell'editor: per avere il menu di Chrome con
  **Leggi ad alta voce** usa **Ctrl+clic destro** (oppure la scorciatoia da tastiera).
- Se il testo sta in un riquadro di un altro sito, la scorciatoia non ci arriva: dal popup compare
  il pulsante per consentire la lettura in quel sito (permesso facoltativo, solo per quel sito);
  in alternativa funziona il tasto destro → Leggi ad alta voce.
- Le scorciatoie si cambiano da `chrome://extensions/shortcuts`. Chi aveva già installato una
  versione precedente conserva le scorciatoie di prima: Chrome non le cambia da solo.
- Sigle e parole inglesi: le sigle che si dicono come parola (RAM, SEO, ISTAT, IVA…) si leggono come
  parola, le altre si compitano (USB, PDF, CPU…); le parole inglesi e i nomi tech più comuni
  (download, browser, Google, YouTube, WhatsApp, iPhone, Wi-Fi…) e le parole tipo CamelCase
  (VHelper → «vi helper») si leggono con la pronuncia inglese, dentro la frase italiana. Non è
  perfetto su tutto: per le parole che restano storte c'è il dizionario.
- **Dizionario di pronuncia** nelle opzioni: coppie «scritto → come si legge» (es. VHelper → vi
  helper), con il pulsante Ascolta per provarle e import/export a righe. Si salva nel profilo
  Chrome dell'utente e si sincronizza con i suoi dispositivi se ha la sincronizzazione attiva.
- La lettura si regola da sola sulla velocità del computer: misura quanto costa la sintesi
  (una parte fissa per ogni blocco e una per ogni suono) e decide durante la lettura quanto testo
  preparare per volta. Il primo blocco è corto per partire presto. Dal secondo in poi un blocco si
  chiude all'ultima fine di frase che ci sta, e solo in una frase più lunga a una virgola. Se il
  computer è più veloce della voce il passaggio non si sente; se è lento come la voce o più, le
  attese restano intorno ai 3 secondi, di solito a fine frase.
- Nelle opzioni dell'estensione, sezione **Risoluzione problemi**: se senti pause, una prova misura
  la sintesi su quel computer e dà un risultato da mandarci.

## Dettatura

- Clicca nel campo dove vuoi scrivere (casella di Gmail, chat di WhatsApp Web o Claude.ai, modulo,
  editor di Joomla) e premi **Alt+S** (su Mac **Control+S**), oppure **Detta** nel popup. Mentre
  ascolta, in basso a destra c'è un pallino rosso con **Ferma**; **Alt+S** di nuovo, o «fine
  dettatura», finisce. Se cambi scheda la dettatura si ferma.
- **Primo uso**: alla prima Alt+S si apre la pagina della dettatura. Lì consenti il microfono (una
  volta sola: Chrome non lascia chiedere il permesso ai documenti nascosti delle estensioni) e
  scegli il modello: la pagina misura il computer e propone quello giusto. Il modello si scarica
  solo allora, non all'installazione, a pezzi con ripresa e controllo SHA-256, e alla fine si misura
  il tempo vero (quanto passa dalla fine della frase al testo).
- **Modelli** (Whisper, esportazioni ONNX di onnx-community): **Normale** (small, 250 MB, sul
  processore, il predefinito), **Leggero** (base, 77 MB, per computer lenti), **Qualità**
  (large-v3-turbo, 565 MB, sulla scheda video con WebGPU). Gli encoder sono ritoccati
  (`scripts/accorcia-encoder.py`) perché lavorino su finestre corte invece che sempre su 30 secondi:
  su una frase breve l'encoder costa un ottavo. La trascrizione parte già durante le pause e le frasi
  lunghe arrivano a pezzi mentre parli.
- **Cosa puoi dire**: «virgola», «punto», «punto e virgola», «due punti», «punto interrogativo»,
  «punto esclamativo», «apri/chiudi parentesi», «apri/chiudi virgolette», «a capo», «nuovo
  paragrafo», «elenco puntato» … «fine elenco», «primo, … secondo, …» (elenco numerato),
  «cancella l'ultima frase», «cancella l'ultima parola», «annulla», «fine dettatura». Le
  correzioni a voce («martedì, no anzi, mercoledì», «cioè volevo dire») tengono solo la parte giusta;
  esitazioni e parole ripetute spariscono. Niente trattini come incisi: diventano virgole.
- **Inserimento**: nei campi di testo con `execCommand('insertText')` (resta il Ctrl+Z del campo e
  React se ne accorge) o il setter nativo del valore; negli editor (Gmail, Claude.ai, WhatsApp Web)
  prima un `beforeinput` come la tastiera e poi `execCommand`. Dove non si può scrivere direttamente
  (Google Docs, nessun campo selezionato) il testo va in una casella con **Copia** e **Inserisci nel
  campo**.
- **Dizionario della dettatura** (pagina della dettatura): sostituzioni «quando senti → scrivi» e
  termini ricorrenti, passati anche a Whisper come contesto, così riconosce meglio nomi e marchi.
- Dettatura e lettura non girano insieme: la dettatura ferma la lettura, una lettura ferma la
  dettatura, la creazione di un MP3 aspetta.
- **Riserva** (spenta di default): il riconoscimento vocale di Chrome. Se Chrome ha l'italiano sul
  dispositivo l'audio resta lì; altrimenti l'audio va ai server di Google, e solo se lo scegli
  esplicitamente.

## Come funziona

Testo → piccola normalizzazione (date, orari, migliaia, unità, abbreviazioni) → eSpeak NG 1.52.0
in WebAssembly → fonemi IPA (identici a quelli di kokoro-onnx in Python, verificato su un corpus di
prova) → modello Kokoro-82M con ONNX Runtime Web (WebAssembly multithread) e lo stile della voce
(`if_sara` o `im_nicola`) → audio a 24 kHz in un documento offscreen, così la lettura continua
anche a popup chiuso. I testi lunghi si leggono a blocchi: mentre uno suona, i successivi si
preparano in anticipo. Per l'MP3 lo stesso motore sintetizza un blocco alla volta, cedendo il passo
alle letture, e un Web Worker con lamejs codifica man mano.

Il modello si scarica dalla release `model-v1` di questo repository; se GitHub non risponde, dalla
stessa revisione su Hugging Face. In entrambi i casi l'estensione controlla l'impronta SHA-256.
Nessun permesso in più rispetto alla 1.1: l'articolo usa activeTab e scripting come la selezione,
l'MP3 si salva con un link di download dal popup (niente permesso `downloads`).

## Privacy

L'estensione non raccoglie e non invia dati: il testo resta sul computer, anche gli MP3 si creano
lì, e l'audio della dettatura si trascrive sul computer. Le sole connessioni servono a scaricare i
file del modello, delle voci e (se detti) del modello di riconoscimento. Dettagli in
[docs/PRIVACY.md](docs/PRIVACY.md).

## Sviluppo

```
npm install            # dipendenze e hook di controllo dei commit
npm run build          # ricostruisce estensione/ da src/
npm run test:fonemi    # confronta i fonemi con il riferimento di kokoro-onnx
npm run test:funzioni  # sezioni, blocchi, nome e tag dell'MP3 (senza browser)
npm run test:pulizia   # pulizia italiana del testo dettato, casi veri (senza browser)
npm run release -- patch "cosa è cambiato"   # nuova versione: changelog, build, zip, tag
npm run store          # rigenera testi della scheda store, privacy e questo README
```

Ogni modifica, anche minima, fa avanzare la versione (patch per le correzioni, minor per le
funzioni). La versione vive solo in `src/manifest.json`; l'hook `.githooks/pre-commit` blocca i
commit che toccano il codice senza versione nuova e senza voce in `CHANGELOG.md`.
Il nome dell'estensione vive solo in `src/manifest.json` (`name` e `short_name`): i testi in
`store/`, `docs/PRIVACY.md` e questo README si rigenerano da `store/template/` con `npm run store`.

## Contatti

WebG, https://www.webg.it, info@webg.it. Per segnalazioni e richieste usa le
[issue di GitHub](https://github.com/WebG-it/webg-voice/issues).

## Licenza

GPL-3.0-or-later (vedi `LICENSE`), perché l'estensione include eSpeak NG. Modello Kokoro-82M di
hexgrad e Mozilla Readability con licenza Apache-2.0, ONNX Runtime Web e Whisper con licenza MIT,
lamejs con licenza LGPL-3.0: dettagli in `THIRD_PARTY.md`.

---

## English

**WebG Voice** is a Chrome extension by [WebG](https://www.webg.it) that reads selected text,
or a whole article, aloud in Italian with natural neural voices (Kokoro-82M, voices Sara and
Nicola) running entirely on your computer, and can save it as MP3. No account, no subscription,
no text sent anywhere; on first start it downloads the voice model (about 326 MB) once, in the
background, then it works offline. Select text and press **Alt+Q** (with nothing selected it reads
the whole article; again to pause or resume, **Alt+W** to stop), or right-click → *Leggi ad alta
voce*. Since 1.3 it also types Italian dictation: press **Alt+S** in any text field and speak;
recognition (OpenAI Whisper, small by default) runs locally and the audio never leaves your computer.
Licensed under GPL-3.0-or-later (it bundles eSpeak NG); see `THIRD_PARTY.md` for the
Kokoro and Readability (Apache-2.0), ONNX Runtime (MIT) and lamejs (LGPL-3.0) notices. Contact:
info@webg.it or GitHub issues.
