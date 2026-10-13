# Scheda Chrome Web Store, WebG Voice 1.0.3

Testi pronti da incollare nel modulo della scheda. Generato da `store/template/scheda.md`
con `npm run store`: non modificare questo file a mano.

## Nome

WebG Voice, leggi ad alta voce offline

## Categoria

Rendi tuo Chrome → Accessibilità (in inglese: Make Chrome Yours → Accessibility).
Lingua principale: italiano.

## Descrizione breve (italiano, 119 caratteri su 132)

Legge ad alta voce in italiano il testo selezionato, con una voce naturale che gira sul tuo computer. Gratis e offline.

## Descrizione breve (inglese, 112 caratteri su 132)

Reads selected text aloud in Italian with a natural voice that runs on your computer. Free, offline, no account.

## Descrizione lunga (italiano)

WebG Voice legge ad alta voce, in italiano, il testo che selezioni in una pagina web. La voce è
naturale ed espressiva e funziona interamente sul tuo computer: non serve un account, non ci sono
abbonamenti e il testo non viene mai inviato a servizi esterni.

Come si usa
• Seleziona il testo e premi Alt+Q, oppure tasto destro → "Leggi ad alta voce". Alt+Q di nuovo mette in pausa, Alt+W ferma.
• Durante la lettura compare una piccola barra con pausa, stop e velocità.
• Dal pulsante dell'estensione puoi incollare un testo e regolare la velocità, da 0,7 a 1,5.

Gratis e offline
Al primo avvio scarica il modello vocale (circa 326 MB) una volta sola, in sottofondo, con
l'avanzamento sull'icona. Se la connessione cade riprende da solo da dove era arrivato; sulle
connessioni a consumo aspetta un tuo clic. Da quel momento la lettura funziona anche senza internet.

Pensata per l'italiano
Numeri, percentuali, date, orari, prezzi e abbreviazioni comuni vengono letti come li direbbe una
persona. I testi lunghi partono in pochi secondi: mentre una parte suona, la successiva si prepara.

Si adatta al tuo computer
La lettura misura da sola la velocità della sintesi e, sui PC più lenti, si regola per evitare
pause. Nelle opzioni c'è una prova di risoluzione problemi.

Privacy
Nessun dato raccolto, nessun tracciamento, nessuna pubblicità. Le sole connessioni servono a
scaricare i file della voce.

Tecnologia: modello Kokoro-82M (Apache-2.0), ONNX Runtime Web (MIT), eSpeak NG (GPL-3.0).
Codice sorgente aperto con licenza GPL-3.0: https://github.com/WebG-it/webg-voice
Realizzata da WebG, https://www.webg.it

## Descrizione lunga (inglese)

WebG Voice reads the text you select on a web page aloud, in Italian. The voice is natural
and expressive and runs entirely on your computer: no account, no subscription, and your text is
never sent to any external service.

How to use it
• Select text and press Alt+Q, or right-click → "Leggi ad alta voce". Alt+Q again pauses, Alt+W stops.
• While reading, a small bar offers pause, stop and speed controls.
• From the extension button you can paste text and set the speed, from 0.7 to 1.5.

Free and offline
On first start it downloads the voice model (about 326 MB) once, in the background.
If the connection drops it resumes on its own; on metered connections it waits for your click.
After that, reading works offline.

Built for Italian
Numbers, percentages, dates, times, prices and common abbreviations are read the way a person
would say them. Long texts start within seconds: while one part plays, the next is prepared.

Adapts to your computer
Reading measures synthesis speed by itself and adjusts on slower PCs to avoid gaps. The options
page has a troubleshooting test.

Privacy
No data collected, no tracking, no ads. The only network connections download the voice files.

Technology: Kokoro-82M model (Apache-2.0), ONNX Runtime Web (MIT), eSpeak NG (GPL-3.0).
Open source under GPL-3.0: https://github.com/WebG-it/webg-voice
Made by WebG, https://www.webg.it

## Scopo unico (single purpose)

Leggere ad alta voce, con una voce sintetica che funziona sul computer dell'utente, il testo che
l'utente seleziona in una pagina o incolla nel popup.

## Giustificazione dei permessi

**activeTab**: serve a leggere il testo selezionato nella scheda in cui l'utente ha appena premuto
la scorciatoia o scelto "Leggi ad alta voce" dal menu, e solo in quel momento. L'estensione non
ha accesso alle pagine in nessun altro caso.

**scripting**: serve, sempre e solo nella scheda autorizzata da activeTab, a ricavare il testo
selezionato e a mostrare la barretta con pausa, stop e velocità durante la lettura.

**contextMenus**: aggiunge la voce "Leggi ad alta voce" al menu del tasto destro quando c'è del
testo selezionato.

**offscreen**: la sintesi vocale e la riproduzione audio girano in un documento offscreen, così la
lettura continua anche dopo la chiusura del popup.

**storage**: salva in locale la velocità scelta, il testo incollato nel popup e la misura di
velocità del computer usata per evitare pause. Nulla viene sincronizzato o inviato.

**unlimitedStorage**: la voce (circa 326 MB) resta nella cache dell'estensione per funzionare
offline; senza questo permesso Chrome potrebbe cancellarla e costringere a riscaricarla.

**Autorizzazioni host (github.com/WebG-it/webg-voice, release-assets.githubusercontent.com,
huggingface.co/onnx-community, *.hf.co)**: servono solo a scaricare i file della voce dalla
release del progetto su GitHub e, se GitHub non risponde, dalla copia originale su Hugging Face.
L'estensione non legge né modifica pagine di questi siti e non invia loro alcun dato dell'utente.

**Autorizzazioni host facoltative (https://\*/\*, http://\*/\*)**: non concesse
all'installazione. Vengono chieste solo se l'utente vuole far leggere un testo che sta in un
riquadro (iframe) di un altro sito, e solo per quel sito, con un clic dal popup: servono a leggere
la selezione dentro quel riquadro, dove activeTab non arriva.

**Codice remoto**: no. Tutto il codice (JavaScript e WebAssembly) è incluso nel pacchetto. I file
scaricati sono i pesi del modello e lo stile della voce, cioè dati, controllati con un'impronta
SHA-256 fissa.

## Pratiche sulla privacy (questionario)

Dati raccolti: nessuno. Per ogni categoria del modulo (informazioni che consentono
l'identificazione personale, informazioni sanitarie, informazioni finanziarie e di pagamento,
informazioni di autenticazione, comunicazioni personali, posizione, cronologia web, attività
dell'utente, contenuti dei siti web) la risposta è "non raccolti".

Il testo da leggere viene elaborato solo sul computer dell'utente e non lascia mai il browser.

Dichiarazioni da spuntare:
- Non vendo né trasferisco i dati degli utenti a terze parti, al di fuori dei casi d'uso approvati.
- Non uso né trasferisco i dati degli utenti per scopi non correlati alla funzionalità principale.
- Non uso né trasferisco i dati degli utenti per determinare l'affidabilità creditizia o a scopo
  di prestito.

URL delle norme sulla privacy: https://github.com/WebG-it/webg-voice/blob/main/docs/PRIVACY.md
(oppure, con GitHub Pages attivo sulla cartella docs/: https://webg-it.github.io/webg-voice/PRIVACY)

## Immagini

- Icona 128×128: `store/immagini/icona-store-128.png`
- Screenshot 1280×800: `store/immagini/screenshot-*.png`
- Tile promozionale piccola 440×280: `store/immagini/tile-440x280.png`

## Sito e assistenza

- Editore: WebG (account sviluppatore "WebG"), contatto pubblico info@webg.it
- Sito: https://www.webg.it
- Assistenza: https://github.com/WebG-it/webg-voice/issues
