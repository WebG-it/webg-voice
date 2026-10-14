# Informativa sulla privacy di WebG Voice

Ultimo aggiornamento: versione 1.2.1.

WebG Voice è un'estensione per Chrome realizzata da WebG (https://www.webg.it) che legge ad alta
voce il testo scelto dall'utente.

## Dati raccolti

Nessuno. L'estensione non raccoglie, non registra e non invia dati personali, testi, cronologia di
navigazione o statistiche d'uso. Non usa cookie, strumenti di analisi o pubblicità.

## Come viene trattato il testo

Il testo selezionato in una pagina, incollato nel popup o, se l'utente chiede di ascoltare
l'articolo, il titolo e il testo dell'articolo vengono trasformati in voce interamente sul
computer dell'utente, dentro il browser. Non vengono mai inviati a server di WebG né a terzi.
L'estensione legge una pagina solo quando l'utente lo chiede (scorciatoia da tastiera, voce del
menu contestuale o pulsante del pannello) e solo nella scheda in cui lo chiede.

Anche i file MP3 si creano sul computer dell'utente e si salvano nella sua cartella dei download:
nessun servizio esterno li riceve.

## Dati salvati sul computer

Restano solo nel browser dell'utente, nello spazio riservato all'estensione:
- i file della voce (circa 326 MB, più mezzo MB per la voce Nicola se la scegli), per
  funzionare offline;
- la velocità di lettura e la voce scelte, l'ultimo testo incollato nel popup e una misura della
  velocità di sintesi del computer;
- il dizionario di pronuncia, se lo usi: le coppie di parole che scrivi nelle opzioni. Si salva
  nello spazio di sincronizzazione di Chrome, quindi se hai la sincronizzazione attiva Chrome lo
  copia sui tuoi altri dispositivi tramite il tuo account Google; WebG non lo riceve.

Si cancellano disinstallando l'estensione.

## Connessioni di rete

Le uniche connessioni servono a scaricare i file della voce, una volta sola al primo avvio
(sulle connessioni a consumo solo dopo un clic dell'utente) e, per la voce Nicola, la prima volta
che l'utente la sceglie: dalla release del progetto su GitHub (github.com e
release-assets.githubusercontent.com) o, in alternativa, da Hugging Face (huggingface.co e il suo CDN *.hf.co). Come
per qualsiasi download, questi servizi ricevono l'indirizzo IP e i dati tecnici della richiesta
secondo le loro informative; l'estensione non trasmette altro.

## Contatti

WebG, https://www.webg.it, info@webg.it. Domande e segnalazioni:
https://github.com/WebG-it/webg-voice/issues

---

## English summary

WebG Voice collects no data. Text (including the article of the page, when you ask to hear
it) is turned into speech locally in your browser and never leaves your computer; MP3 files are
also created locally. The only network requests download the voice files (about 326 MB, plus
half a MB for the Nicola voice if you pick it) from the project's GitHub release or, as a
fallback, from Hugging Face. Settings and
the voice files are stored locally and removed when you uninstall the extension.
