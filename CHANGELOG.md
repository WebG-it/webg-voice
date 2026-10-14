# Registro delle modifiche

Ogni modifica all'estensione, anche minima, fa avanzare la versione: patch per le correzioni,
minor per le funzioni nuove. La versione vive solo in `src/manifest.json`; ogni versione ha qui
la sua voce e un tag git `vX.Y.Z`.

## [1.2.0] - 2026-10-15

- Lettura più fluida, correzione della lentezza segnalata sulla 1.1.1 (fino a 20 secondi prima di partire e una pausa a ogni fine riga, a ogni punto e a ogni a capo). Le cause: ogni a capo era trattato come un paragrafo e chiudeva un blocco, quindi un testo copiato da PDF o mail diventava un blocco per riga, spesso a metà frase; sopra un certo rapporto col tempo reale scattava una modalità "PC lento" a blocchi corti spezzati alle virgole, con un costo fisso di circa 0,6 secondi ciascuno, che teneva alta la misura stessa anche a carico finito; e si aspettavano due blocchi pronti prima di partire. Ora gli a capo dentro una frase si uniscono (anche le parole sillabate), le sezioni si tagliano solo a fine periodo, e i blocchi si compongono durante la lettura con il costo della sintesi misurato sul posto: il primo è scelto simulando l'inizio, in modo da partire entro 2 secondi; dopo, un blocco si chiude a una virgola solo se il successivo arriverà in tempo, altrimenti a fine frase, e quando la sintesi è più lenta della voce i blocchi restano medi perché ogni attesa sia breve. Niente più attesa di due blocchi; la stima salvata della velocità del computer conta solo per il primo blocco ed è limitata; eSpeak e modello si caricano insieme e il motore si prepara già all'apertura del pannello.
- Misure sul PC di prova (Ryzen 7 7735U, build di produzione, velocità 1,1, testo a righe di tre paragrafi e articolo di 1.043 parole): primo suono da 4,5-6,8 secondi a 1,4 secondi, frase breve a caldo da 3,0-5,7 a 1,3-2,0 secondi; con il computer libero una sola pausa di 0,12 secondi sull'articolo; con il computer occupato da altro (sintesi alla pari della voce) le pause restano a fine frase e sotto i 3,3 secondi, mentre la 1.1.1 arrivava a 12 secondi. Verificati e lasciati come sono: isolamento, SharedArrayBuffer, WebAssembly SIMD e 8 thread (il valore migliore fra 4, 6, 8, 12 e 15); WebGPU provato e scartato (audio rotto e sintesi più lenta sulla GPU integrata AMD); più motori in parallelo scartati (nessun guadagno, 1,2 GB di memoria ciascuno).
- L'audio già ascoltato non resta più in memoria: prima ogni lettura teneva tutto il suo audio, circa 5,8 MB al minuto. Su una voce di Wikipedia di 4.526 parole letta tutta (26 minuti) la memoria dell'audio è rimasta sotto 1 MB.
- Legge l'articolo intero: Alt+Q senza selezione, il tasto destro sulla pagina → "Leggi tutto l'articolo" e il pulsante "Leggi l'articolo" del pannello leggono titolo e testo dell'articolo, senza menu, pubblicità, commenti, banner dei cookie e righe di servizio, con Mozilla Readability 0.6.0 (Apache-2.0) iniettato solo nel momento della richiesta. Con una selezione vince la selezione; durante una lettura Alt+Q resta pausa e ripresa. Senza un articolo riconoscibile: "!" sull'icona e spiegazione nel pannello. Provato su webg.it, scossaditerremoto.it, Wikipedia, Il Post, Corriere e ANSA (da 529 a 4.526 parole, estrazione in 50-170 ms).
- Scarica MP3 nel pannello: testo incollato, selezione o articolo diventano un file MP3 (mono, 24 kHz, 64 kbps, circa mezzo MB al minuto) con il titolo dell'articolo o l'inizio del testo come nome e i tag ID3, creato in locale con lamejs 1.2.1 (LGPL-3.0) in un Web Worker. Barra di avanzamento, Annulla, avanzamento anche sull'icona; si può chiudere il pannello e il file si salva riaprendolo. Una lettura chiesta intanto ha la precedenza. Nessun permesso downloads: si salva con un link dal pannello. Provato: articolo di 506,7 secondi, ffprobe 506,81 secondi, decodifica senza errori.
- Voce Nicola accanto a Sara, scelta nel pannello e nelle opzioni (con Ascolta) e ricordata. Lo stile im_nicola (mezzo MB, SHA-256 verificata) si scarica dalla release model-v1, con riserva Hugging Face, solo la prima volta che la si sceglie; cambiare voce durante una lettura rifà i blocchi non ancora partiti.
- Nessun permesso nuovo rispetto alla 1.1.1. Scheda dello store, informativa, README e THIRD_PARTY.md aggiornati; nuovi test (test:funzioni, e2e delle funzioni, misure sulla build di produzione).

## [1.1.1] - 2026-10-13

- Scheda store: la giustificazione del permesso storage dice com'è davvero: le impostazioni restano in locale, il dizionario di pronuncia usa chrome.storage.sync e quindi viaggia con la sincronizzazione di Chrome dell'utente se è attiva; lo sviluppatore non riceve nulla.
- Dizionario di pronuncia salvato in più chiavi di chrome.storage.sync, ognuna sotto gli 8 KB, con un indice: entrano 300 voci anche lunghe e accentate fino al limite reale di 100 KB; oltre, un messaggio dice quanto occupa e nulla si perde. Il formato della 1.1.0 a chiave unica si legge e si converte al primo salvataggio.
- Le letture del dizionario sono testo letterale: "$&" e "$1" non vengono più interpretati.
- Import: ogni riga si divide sul primo "=" (la lettura può contenerne altri); il messaggio dice quante voci sono state salvate e quante righe scartate.

## [1.1.0] - 2026-10-13

- Pronuncia delle sigle: quelle che in italiano si dicono come parola (RAM, SEO, NATO, ISTAT, IVA, INPS, PIN, LED…) si leggono come parola; quelle che si compitano (USB, CPU, PDF, HTML, API…) restano compitate da espeak; poche si dicono all'inglese (CEO, OK). Per le sigle fuori lista decide un'euristica di pronunciabilità; numeri romani e parole brevi dei titoli in maiuscolo restano come sono.
- Parole inglesi e nomi tech dentro il testo italiano (download, browser, password, Google, YouTube, WhatsApp, iPhone, Wi-Fi, Cloudflare…) e parole CamelCase (VHelper diventa «vi helper») si fonemizzano con la voce inglese di espeak e si inseriscono nella frase italiana senza marcatori: la frase resta fluida e articoli e preposizioni non cambiano accento.
- Dizionario di pronuncia nelle opzioni: coppie «scritto → come si legge» salvate in chrome.storage.sync, applicate prima della fonemizzazione, con Ascolta per provarle e import/export a righe.
- Le frasi solo italiane restano identiche: 35 frasi su 44 del corpus di prova uguali alla versione precedente, le 9 cambiate contengono sigle o parole inglesi; la parità con kokoro-onnx resta 44 su 44.

## [1.0.5] - 2026-10-13

- Riscontro quando la scorciatoia o il menu non possono leggere: sulle pagine dove Chrome non lascia entrare le estensioni (chrome://, Chrome Web Store, visualizzatore PDF, file locali senza permesso) l'icona mostra "!" per 5 secondi, il titolo dell'icona spiega il motivo e il popup dice di incollare il testo.
- Scorciatoia premuta senza testo selezionato e senza lettura in corso: "!" sull'icona e il messaggio "Seleziona un testo e premi" con la scorciatoia reale letta da Chrome.
- Il popup segnala quando Chrome ha lasciato vuota la scorciatoia (tasti già usati da un'altra estensione), con il link per impostarla.

## [1.0.4] - 2026-10-13

- Nome dell'estensione solo "WebG Voice": il sottotitolo descrittivo passa nella descrizione.
- Estensione localizzata in italiano (predefinito) e inglese: nome, descrizione, voce del menu e comandi da _locales; la descrizione inglese chiarisce che la voce è italiana.
- Testi della scheda store, tile e README: "offline" sempre con "dopo il primo download" (circa 326 MB, una volta sola).
- Privacy: Hugging Face indicato come huggingface.co e il suo CDN *.hf.co. THIRD_PARTY.md del pacchetto cita solo file presenti e rimanda al repository per sorgenti e script; aggiunto il testo della licenza Apache-2.0 (Kokoro, vocab.js).
- Mac: scorciatoie predefinite Control+Q e Control+W, perché Option+Q scrive "œ". Su Windows e Linux restano Alt+Q e Alt+W; chi ha già l'estensione conserva le scorciatoie che aveva.

## [1.0.3] - 2026-10-13

- Il modello vocale (circa 330 MB) si scarica da solo, in sottofondo, all'installazione e all'avvio del browser se manca: niente più conferma. Avanzamento in percentuale sull'icona (badge) e nel popup. Eccezione: su connessione a consumo (risparmio dati o rete cellulare) aspetta un clic.
- Se si chiede una lettura durante il download, parte appena il modello è pronto e la barretta mostra l'avanzamento. Se il download si interrompe riprende da solo con attese crescenti, poi propone Riprova.
- Regolazione automatica e continua per i PC lenti: il rapporto col tempo reale si misura durante le letture (media mobile, salvata ogni pochi blocchi) e decide dimensione dei blocchi e anticipo; senza misure si parte prudenti.
- Popup essenziale, senza diagnostica. La prova di sintesi resta nelle opzioni, nella sezione chiusa Risoluzione problemi, con link alle issue.
- Nuove scorciatoie predefinite: Alt+Q legge il testo selezionato e, sullo stesso testo, mette in pausa e riprende; Alt+W ferma la lettura. Chi ha già l'estensione installata conserva le scorciatoie che aveva: Chrome non le cambia, si modificano da chrome://extensions/shortcuts.

## [1.0.2] - 2026-10-13

- Sicurezza: i messaggi fra le parti dell'estensione si accettano solo dal mittente previsto (stesso id, offscreen solo dal service worker, barretta solo per i comandi di lettura) e con valori validati.
- Gli hook dei test sono tolti dalla build di produzione; per i test c'è npm run build:test (estensione-test/).
- Repository: .gitignore più ampio, scansione segreti con gitleaks nel pre-commit e su GitHub, SECURITY.md, Dependabot, commit di espeak-ng fissato e verificato, store/modelli rinominata store/template.

## [1.0.1] - 2026-10-13

- Correzione: la selezione si legge in tutti i riquadri della pagina (iframe), non solo nel principale. Prima negli editor come TinyMCE di Joomla la scorciatoia non leggeva niente.
- Gestiti anche aree di testo, campi, contenteditable ed editor di codice (CodeMirror); vince il riquadro col focus, la barretta resta nella pagina principale.
- Per i riquadri di altri siti il popup chiede, solo al bisogno, il permesso per quel sito (optional_host_permissions).

## [1.0.0] - 2026-10-13

- Prima versione pubblica col marchio WebG.
- Lettura del testo selezionato con scorciatoia (Alt+Maiusc+L) o menu contestuale, barretta
  sulla pagina con pausa, stop e velocità, popup per il testo incollato.
- Voce Kokoro-82M `if_sara` in locale (ONNX Runtime Web, WebAssembly multithread), fonemi
  italiani con eSpeak NG 1.52.0, identici a quelli di kokoro-onnx in Python.
- Primo download del modello solo dopo conferma, a pezzi con ripresa, da GitHub con
  Hugging Face come riserva e controllo dell'impronta SHA-256.
- Pagina di diagnostica con prova di velocità e adattamento automatico sui PC lenti.
