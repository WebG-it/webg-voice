# Informativa sulla privacy di WebG Voice

Ultimo aggiornamento: versione 1.5.0.

WebG Voice è un'estensione per Chrome realizzata da WebG (https://www.webg.it) che legge ad alta
voce il testo scelto dall'utente e scrive nei campi delle pagine sotto dettatura.

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

## Voce del sistema (computer lenti)

Sui computer lenti la lettura può usare la voce del sistema offerta da Chrome invece di quella di
WebG Voice. In automatico si usano solo voci installate sul computer, che leggono senza mandare il
testo da nessuna parte. Se l'utente sceglie a mano una voce indicata come «in rete», il testo da
leggere va al servizio che fornisce quella voce, secondo la sua informativa: le opzioni lo dicono
accanto alla scelta.

## Dettatura e microfono

Il microfono si usa solo per la dettatura, solo dopo il permesso che l'utente dà una volta nella
pagina della dettatura, e solo mentre la dettatura è attiva: si accende con Ctrl+Spazio (o il pulsante
Detta) e si spegne quando l'utente la ferma, cambia scheda o chiude la pagina. Mentre ascolta, la
pagina mostra un indicatore rosso in alto e Chrome il suo indicatore del microfono.

L'audio si trascrive interamente sul computer dell'utente, con il modello di riconoscimento dentro il browser:
non viene registrato su disco, non viene inviato a WebG né a terzi, e resta in memoria solo il tempo
di trascrivere una frase. Il testo trascritto va solo nel campo scelto dall'utente (o nella casella
della dettatura, per copiarlo).

Riserva facoltativa, spenta di default: nella pagina della dettatura l'utente può scegliere il
riconoscimento vocale di Chrome. Se Chrome ha l'italiano sul dispositivo, anche in quel caso l'audio
resta sul computer. Solo se l'utente sceglie esplicitamente l'opzione «anche mandando l'audio a
Google», l'audio della dettatura viene inviato ai server di Google per il riconoscimento, secondo
l'informativa di Google: la pagina lo dice chiaramente prima della scelta.

## Dati salvati sul computer

Restano solo nel browser dell'utente, nello spazio riservato all'estensione:
- i file della voce (circa 326 MB, più mezzo MB per la voce Nicola se la scegli), per
  funzionare offline;
- la velocità di lettura e la voce scelte, l'ultimo testo incollato nel popup, una misura della
  velocità di sintesi del computer e le scelte delle opzioni "Evidenzia nella pagina la frase"
  e "Tieni la voce pronta";
- i modelli della dettatura, solo se detti (77, 250 o 565 MB secondo il modello scelto), e le
  impostazioni della dettatura (modello, punteggiatura automatica, riserva, misura della velocità);
- il dizionario della dettatura, se lo usi (sostituzioni e termini ricorrenti): come quello di
  pronuncia, si salva nello spazio di sincronizzazione di Chrome;
- il dizionario di pronuncia, se lo usi: le coppie di parole che scrivi nelle opzioni. Si salva
  nello spazio di sincronizzazione di Chrome, quindi se hai la sincronizzazione attiva Chrome lo
  copia sui tuoi altri dispositivi tramite il tuo account Google; WebG non lo riceve.

Si cancellano disinstallando l'estensione.

## Connessioni di rete

Le uniche connessioni servono a scaricare i file della voce e, se si usa la dettatura, quelli del
modello di riconoscimento (alla prima dettatura, dalla release del progetto su GitHub e da Hugging
Face, con controllo SHA-256). I file della voce si scaricano una volta sola al primo avvio
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
fallback, from Hugging Face. Dictation (Ctrl+Space) uses the microphone only while it is active and
transcribes the audio locally; the audio is never stored or sent anywhere, unless you
explicitly choose the optional Chrome speech recognition that sends audio to Google. The dictation
models (77 to 565 MB) are downloaded only the first time you dictate. Settings and
the voice files are stored locally and removed when you uninstall the extension.
