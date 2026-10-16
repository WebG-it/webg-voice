# Registro delle modifiche

Ogni modifica all'estensione, anche minima, fa avanzare la versione: patch per le correzioni,
minor per le funzioni nuove. La versione vive solo in `src/manifest.json`; ogni versione ha qui
la sua voce e un tag git `vX.Y.Z`.

## [1.3.7] - 2026-10-16

- Download del modello della dettatura dalla release GitHub dettatura-v1 come fonte principale (Hugging Face resta riserva); chi aveva l'encoder originale della riserva passa da solo a quello corto (subito la riserva, il corto in sottofondo, dalla volta dopo il corto); avanzamento senza il nome del sito. Stato della dettatura nel popup e nelle opzioni: pronta, oppure non ancora pronta con la percentuale del download (Detta in attesa). Niente testo inventato sul silenzio: VAD piu' severo (picco sopra il rumore, parlato minimo 300 ms), scarto delle uscite con probabilita' di silenzio alta, modello poco sicuro, ripetizioni o testo uguale al pezzo prima, frasi tipiche dei sottotitoli; niente testo precedente nel prompt; a mani libere la dettatura si ferma da sola dopo 20 secondi di silenzio e lo dice nella pillola.

## [1.3.6] - 2026-10-16

- Il modello della dettatura si scarica da solo: alla prima pressione della scorciatoia (o di Detta) l'estensione sceglie il modello adatto al computer, lo scarica con l'avanzamento nella pillola in pagina e parte da sola; se il download si interrompe, la pressione successiva riprende da dove era arrivato. La pagina della dettatura si apre solo se manca il permesso del microfono, e da li' il modello si scarica da solo; il pulsante Scarica compare solo come Riprova. ONNX Runtime per WebGPU si carica solo se si sceglie il modello Qualita' (niente piu' avviso powerPreference con Normale): la scheda video si controlla senza caricarlo.

## [1.3.5] - 2026-10-16

- Correzione urgente della 1.3.4: la pagina della dettatura non partiva (errore di sintassi in dettatura.js, un apostrofo dentro una stringa), quindi microfono fermo su Controllo il permesso, nessun modello scelto, Detta qui senza effetto. Ora la build controlla la sintassi di ogni script; la pagina ha una guardia che avvisa se lo script non parte, ogni passo dell'avvio ha un tempo massimo con messaggio visibile, il modello consigliato e' sempre preselezionato, lo stato salvato incoerente delle versioni precedenti (misura vecchia, Leggero proposto e mai scaricato) si azzera da solo. Tocco breve misurato al rilascio del tasto anche se l'avvio e' lento.

## [1.3.4] - 2026-10-16

- Prima prova di Marco: premi per parlare (Ctrl+Spazio tenuto registra, al rilascio scrive; tocco breve sotto 300 ms resta a mani libere; ripetizione automatica della tastiera ignorata; rilascio visto dalla pagina con keyup o perdita del fuoco). Pagina della dettatura aperta una volta sola e riportata in primo piano se c'e' gia'. Indicatore subito alla pressione, in alto e ben visibile, con livello del microfono; se manca il microfono o il modello lo dice nella pagina e apre la pagina della dettatura; il microfono ascolta mentre il modello si carica. Proposta del modello robusta (misura ripetuta, migliore valore, Normale salvo computer davvero lenti, niente numeri). Testi per l'utente senza nomi tecnici, esempi del dizionario neutri. Opzioni: sezioni Scorciatoie (tasto attuale, non assegnata con spiegazione, pulsante per cambiarle) e Dettatura.

## [1.3.3] - 2026-10-16

- Scorciatoia della dettatura: Ctrl+Spazio, due tasti con la mano sinistra (Chrome la assegna davvero, verificato). Su Mac resta Control+Maiusc+X, perche' Control+Spazio sul Mac cambia la lingua di digitazione. Ctrl+Spazio prende il posto dell'autocompletamento negli editor di codice nel browser e della selezione di colonna in Google Fogli; si cambia da chrome://extensions/shortcuts.

## [1.3.2] - 2026-10-16

- Licenze dei modelli Whisper allineate: base e small Apache-2.0 (LICENSE-APACHE-2.0.txt), large-v3-turbo MIT, Copyright OpenAI, esportazioni ONNX di onnx-community; encoder modificati da WebG con scripts/accorcia-encoder.py, modifica dichiarata in THIRD_PARTY.md come chiede Apache-2.0.

## [1.3.1] - 2026-10-16

- Scorciatoia della dettatura: Ctrl+Maiusc+X (su Mac Control+Maiusc+X), tutta con la mano sinistra. Chrome la assegna davvero all'estensione (verificato) e non collide con Chrome, Gmail, Google Docs, WhatsApp Web e Claude.ai; Ctrl+Maiusc+S in Google Docs apre la digitazione vocale, Ctrl+Maiusc+E centra il testo.

## [1.3.0] - 2026-10-16

- Dettatura: Alt+S avvia e ferma la dettatura nel campo dove si scrive (campi di testo, textarea di React, editor come Gmail, Claude.ai e WhatsApp Web, riquadri come TinyMCE). Alt+D, chiesto all'inizio, e' una scorciatoia di Chrome (barra degli indirizzi) e Chrome non la assegna alle estensioni.
- Riconoscimento sul computer con Whisper in ONNX Runtime Web: Normale (small int8, 250 MB, predefinito, sul processore), Leggero (base, 77 MB), Qualita' (large-v3-turbo q4f16, 565 MB, su WebGPU). Encoder ritoccati per finestre corte, trascrizione in anticipo durante le pause, frasi lunghe a pezzi mentre si parla. Misure sul Corridoio: frase di 3-5 s in 0,9-1,4 s dalla fine del parlato (Normale), pezzi di 4 s in circa 2 s.
- Primo uso nella pagina della dettatura: permesso del microfono, misura del computer con proposta del modello, download a richiesta (non all'installazione) con avanzamento, ripresa, SHA-256 e fonte di riserva, misura del tempo reale. Indicatore discreto nella pagina, casella con Copia e Inserisci dove non si puo' scrivere (Google Docs, nessun campo).
- Pulizia italiana deterministica: esitazioni, ripetizioni, autocorrezioni (no anzi, cioe' volevo dire, scusa), punteggiatura, a capo ed elenchi a voce, maiuscole fra i segmenti, comandi (cancella l'ultima frase, annulla, fine dettatura), niente trattini come incisi, dizionario della dettatura passato anche a Whisper.
- Riserva facoltativa con il riconoscimento di Chrome, spenta di default; l'invio dell'audio a Google solo se scelto esplicitamente. Dettatura e lettura non girano insieme sul processore.

## [1.2.2] - 2026-10-15

- A capo, correzione di una regressione della 1.2.1: righe di larghezza simile che non sono un testo a righe fisse venivano unite in un paragrafo solo (cinque titoli di giornale incollati uno per riga, voci lunghe senza punto, citazioni che chiudono con «»). Ora un testo è "a righe fisse" solo se, oltre alla larghezza simile, almeno metà dei passaggi fra righe lunghe mostra una frase spezzata: la riga dopo comincia in minuscolo o con una cifra, oppure la riga prima finisce con una virgola, un trattino o una parola che non chiude una frase (di, il, negli, e, che…). Restano unite le righe dei PDF e "il collega / Mario Rossi … negli / Stati Uniti".
- In ogni testo una riga che finisce con una virgola o con una di quelle parole continua nella riga dopo ("Il prezzo è di / 20 euro", "fissata per il / 12 ottobre", "Torino, / Milano, / Roma"); la sola minuscola a inizio riga non basta, così "Come si prepara / farina" resta separato. Le sigle in maiuscolo (TO, IL) non contano come parole.
- Trattini a fine riga: tolti dai prefissi quelli che sono anche l'inizio di parole comuni (pro, co, pre, eco, auto, bio, tele, non, e e simili), così "pro-getto", "co-munità", "pre-sidente", "eco-nomia", "tele-visione" si ricompongono. Restano col trattino nord, sud, est, ovest, centro, ex, anti, post, socio, euro, italo, anglo, afro, ispano.
- Nelle mail citate i segni ">" a inizio riga si tolgono e non finiscono più dentro la frase.
- Verifiche: test:funzioni 61 su 61 con i casi di regressione, fonemi 44 su 44, script di controllo del revisore tutti a posto.

## [1.2.1] - 2026-10-15

- Articolo intero: i paragrafi dell'articolo si separano con una riga vuota, così titoli, voci di elenco e citazioni restano a sé anche senza punto finale. Prima la regola degli a capo della 1.2.0 li ricuciva ("Come si prepara farina uova fresche latte intero").
- A capo: un testo è considerato "a righe fisse" (PDF, mail) solo se ha almeno tre righe lunghe e quasi tutte vicine alla stessa larghezza, entro i 200 caratteri. Solo lì una riga lunga senza punteggiatura finale continua nella riga dopo, anche quando questa comincia con una maiuscola ("il collega / Mario Rossi", "negli / Stati Uniti"). Le righe corte restano a sé: titoli, voci di elenco, indirizzi ("Via Roma 12 / 10100 Torino"), elenchi di parole ("Frutta / mele / pere"). Una riga che finisce con una cifra seguita da una che comincia con una cifra resta sempre un confine.
- Il punto che dà la pausa si aggiunge solo ai titoli veri (paragrafi brevi senza punteggiatura), non più alle righe spezzate a metà frase.
- Trattini a fine riga: restano per prefissi e composti (nord-est, ex-marito, anti-age, euro-atlantico e simili), per le sigle in maiuscolo e davanti a una cifra (COVID-19); negli altri casi la parola sillabata si ricompone. Il trattino morbido (U+00AD) si toglie.
- Sezioni dei testi lunghi: una riga più lunga della sezione si taglia a fine frase, e a parola solo come ultima risorsa; nessuna sezione supera 1,25 volte la sua misura. Prima una riga da 63.000 caratteri dava una sezione da 61.740.
- README, CHANGELOG, commenti e testo della diagnostica descrivono quello che il codice fa davvero: dopo il primo, un blocco si chiude all'ultima fine di frase che ci sta, e solo in una frase più lunga a una virgola; con il computer lento come la voce o più, le attese restano intorno ai 3 secondi, di solito a fine frase. Tolta dal codice l'opzione interna sulle virgole, che era sempre attiva.
- Scheda dello store: la riga "Tecnologia" cita anche Mozilla Readability e lamejs.
- Verifiche: test:funzioni 53 su 53 (con titoli, elenchi, citazioni, nomi a capo, trattini, indirizzi e sezioni enormi), fonemi 44 su 44, e2e delle funzioni e lettura completa verdi. Misura A/B sulla build di produzione, stesso PC e velocità 1,1, CPU al 35-44%: 1.2.0 e 1.2.1 uguali, primo suono 1,3-1,8 secondi, frase breve a caldo 1,1-1,2 secondi, una sola pausa (2,2 secondi sul testo a righe, 1,5 sull'articolo di 1.043 parole).
- Zip per lo store costruito dal tag, con le fini riga del repository (prima 4 file uscivano con fine riga Windows).

## [1.2.0] - 2026-10-15

- Lettura più fluida, correzione della lentezza segnalata sulla 1.1.1 (fino a 20 secondi prima di partire e una pausa a ogni fine riga, a ogni punto e a ogni a capo). Le cause: ogni a capo era trattato come un paragrafo e chiudeva un blocco, quindi un testo copiato da PDF o mail diventava un blocco per riga, spesso a metà frase; sopra un certo rapporto col tempo reale scattava una modalità "PC lento" a blocchi corti spezzati alle virgole, con un costo fisso di circa 0,6 secondi ciascuno, che teneva alta la misura stessa anche a carico finito; e si aspettavano due blocchi pronti prima di partire. Ora gli a capo dentro una frase si uniscono (anche le parole sillabate), le sezioni si tagliano solo a fine periodo, e i blocchi si compongono durante la lettura con il costo della sintesi misurato sul posto: il primo è scelto simulando l'inizio, in modo da partire entro 2 secondi; dopo, un blocco si chiude all'ultima fine di frase che ci sta (in una frase più lunga a una virgola), con una lunghezza scelta perché il successivo arrivi in tempo o, quando la sintesi è più lenta della voce, perché ogni attesa resti intorno ai 3 secondi. Niente più attesa di due blocchi; la stima salvata della velocità del computer conta solo per il primo blocco ed è limitata; eSpeak e modello si caricano insieme e il motore si prepara già all'apertura del pannello.
- Misure sul PC di prova (Ryzen 7 7735U, build di produzione, velocità 1,1, testo a righe di tre paragrafi e articolo di 1.043 parole): primo suono da 4,5-6,8 secondi a 1,4 secondi, frase breve a caldo da 3,0-5,7 a 1,3-2,0 secondi; con il computer libero una sola pausa di 0,12 secondi sull'articolo; con il computer occupato da altro (sintesi alla pari della voce) le pause restano sotto i 3,3 secondi, di solito a fine frase, mentre la 1.1.1 arrivava a 12 secondi. Verificati e lasciati come sono: isolamento, SharedArrayBuffer, WebAssembly SIMD e 8 thread (il valore migliore fra 4, 6, 8, 12 e 15); WebGPU provato e scartato (audio rotto e sintesi più lenta sulla GPU integrata AMD); più motori in parallelo scartati (nessun guadagno, 1,2 GB di memoria ciascuno).
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
