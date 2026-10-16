# Registro delle modifiche

Ogni modifica all'estensione, anche minima, fa avanzare la versione: patch per le correzioni,
minor per le funzioni nuove. La versione vive solo in `src/manifest.json`; ogni versione ha qui
la sua voce e un tag git `vX.Y.Z`.

## [1.5.0] - 2026-10-16

- Lettura fluida anche sui computer lenti o occupati: scelta automatica della voce in base alla velocita' misurata (rimisurata ogni giorno). Qualita' massima (Kokoro fp32) sui computer veloci; Bilanciata (stesso Kokoro in uint8, 177 MB, scaricato solo se serve, circa il 13% piu' leggero con pochi core) quando il computer e' carico; Leggera, la voce del sistema offerta da Chrome (solo voci italiane installate, scelte per qualita', mai eSpeak) quando nemmeno la Bilanciata regge, con avviso nel pannello. Scelta a mano nelle opzioni, sezione Voce per i computer lenti; una voce del sistema in rete si puo' scegliere solo a mano ed e' dichiarata. Misurati e scartati: Kokoro int8 e q8f16 (piu' lenti), fp16 (piu' lento e sbaglia parole), q4f16 (nessun guadagno), WebGPU sulla scheda video integrata (audio vuoto).

## [1.4.2] - 2026-10-16

- Lettura con il computer carico: riserva d'audio adattiva. Si misura in continuo il rapporto fra sintesi e voce; quando la sintesi e' piu' lenta della voce, la voce parte dopo una piccola riserva (attesa iniziale al massimo 4 secondi) e, se resta senza audio, riprende solo con almeno 2-6 secondi pronti: poche pause a fine blocco invece di fermarsi a ogni blocco; il pannello dice che il computer e' occupato. Con il computer veloce non cambia niente. La lettura chiude il motore della dettatura inattivo. Misure sullo stesso articolo (940 parole, 5 min 24 s di voce) col Corridoio carico: 1.4.1 84 pause (somma 177 s, massima 6,1 s), 1.4.2 27 pause (somma 146 s, massima 11,5 s, primo suono 2,7 s). Non c'era una causa nuova dal merge: la 1.2.2 a carico simile faceva 43 pause; le pause dipendono dal carico del computer (sintesi da 1,1 a 2,2 volte il tempo reale durante le prove).

## [1.4.1] - 2026-10-16

- Pannello ridisegnato: due azioni grandi in alto, Leggi (selezione o articolo; Pausa e Riprendi durante la lettura, con Ferma accanto solo quando serve) e Detta (pronta, scarico 62%, ti ascolto); sotto ciascuna le scorciatoie vere come tasti, o «non impostata · Sistema»; voce e velocita' in una riga; una riga di stato; testo incollato in una sezione richiudibile che resta come la lasci; Rileggi la bozza e Crea MP3 piccoli in fondo; Impostazioni come ingranaggio in alto. Catture di controllo con test/e2e/popup-catture.mjs.

## [1.4.0] - 2026-10-16

Lettura e dettatura insieme (riunisce le 1.3.x del ramo della dettatura e la 1.3.0 della lettura, mai uscite).

### Dettatura (nuova)

- Ctrl+Spazio (su Mac Control+Maiusc+X) in un campo di qualsiasi pagina: premi per parlare (tenuto registra, al rilascio scrive) oppure tocco breve per dettare a mani libere fino alla pressione successiva, o fino a 20 secondi di silenzio. Anche dal pulsante Detta del pannello. Alt+D e Alt+S scartate: Alt+D è di Chrome, Alt+S di altre estensioni; Ctrl+Maiusc+S e Ctrl+Maiusc+E collidono con Google Docs.
- Riconoscimento sul computer con Whisper in ONNX Runtime Web, nessun audio fuori dal computer: Normale (small int8, 250 MB, predefinito, sul processore), Leggero (base, 77 MB, per computer lenti), Qualità (large-v3-turbo q4f16, 565 MB, sulla scheda video). Encoder ritoccati per finestre corte (scripts/accorcia-encoder.py), trascrizione in anticipo durante le pause, frasi lunghe a pezzi mentre si parla. Misure sul PC di prova: frase di 3-5 secondi in circa 1-1,5 secondi dalla fine del parlato.
- Il modello si scarica da solo alla prima dettatura (quello adatto al computer, misurato in un attimo), con l'avanzamento nella pillola, a pezzi con ripresa e SHA-256, dalla release GitHub dettatura-v1 (Hugging Face come riserva; chi ha l'encoder della riserva passa da solo a quello corto). La pagina della dettatura si apre solo se manca il permesso del microfono. Stato della dettatura nel pannello e nelle opzioni.
- Indicatore subito alla pressione, in alto nella pagina, con il livello del microfono; casella con Copia e Inserisci dove non si può scrivere (Google Docs, nessun campo). Inserimento in campi di testo, textarea di React, editor come Gmail, Claude.ai e WhatsApp Web, riquadri come TinyMCE; annulla dell'ultimo pezzo.
- Pulizia italiana deterministica: esitazioni, ripetizioni, autocorrezioni (no anzi, cioè volevo dire, scusa), punteggiatura, a capo ed elenchi a voce, maiuscole fra i segmenti, comandi (cancella l'ultima frase, annulla, fine dettatura), niente trattini come incisi; dizionario della dettatura passato anche al modello.
- Niente testo inventato sul silenzio o sul rumore: VAD severo, scarto delle uscite con probabilità di silenzio alta, poco sicure, ripetute o tipiche dei sottotitoli.
- Riserva facoltativa con il riconoscimento di Chrome, spenta di default; l'invio dell'audio a Google solo se scelto esplicitamente.
- Dettatura e lettura non girano insieme sul processore: la dettatura ferma la lettura, una lettura ferma la dettatura, l'MP3 aspetta; il documento della voce non si chiude durante una dettatura; sui computer con meno di 8 GB la voce tenuta pronta si libera quando parte la dettatura.
- Opzioni: sezione Scorciatoie (tasto attuale, «non assegnata» con la spiegazione, pulsante per cambiarle) e sezione Dettatura.
- Build: controllo della sintassi di ogni script del pacchetto (la 1.3.4 interna era uscita con un errore di sintassi nella pagina della dettatura).

### Lettura

- Evidenzia la frase in lettura: mentre legge una selezione o un articolo, la frase che si sente si evidenzia nella pagina con la CSS Custom Highlight API (il testo della pagina non viene modificato) e la pagina scorre per tenerla in vista. Il testo letto è normalizzato (numeri in lettere, sigle sciolte), quindi la frase si ritrova allineando le parole: fra le possibili corrispondenze vince quella che copre più parole del blocco e le ha più fitte, così una frase ripetuta in un riquadro laterale o in una nota non la ruba. Se l'utente scorre con rotella, tastiera o tocco, per 5 secondi la pagina non viene spostata. Se l'utente passa a un'altra scheda la lettura continua: evidenziazione e scorrimento si fermano mentre la scheda è nascosta e, al ritorno, riprendono dalla frase che si sta ascoltando (la scheda chiede all'offscreen la frase in corso, perché i messaggi arrivati mentre Chrome teneva ferma la scheda si possono perdere). Dentro aree di testo, campi, riquadri ed editor non si evidenzia, senza errori. Si spegne nelle opzioni, sezione Lettura. Provata su webg.it, Wikipedia, Il Post, scossaditerremoto.it, Corriere e ANSA: frasi evidenziate giuste e in ordine.
- Rileggi la bozza: pulsante nel pannello, per chi scrive. Rilegge il testo incollato o selezionato, anche dentro TinyMCE, aree di testo e riquadri modificabili, 0,15 più lento della velocità scelta (mai sotto 0,7), una frase alla volta con 0,35 secondi di pausa in più. Nel pannello elenca le parole ripetute a meno di 3 frasi di distanza: stessa parola o stessa radice, almeno 4 lettere, esclusi articoli, preposizioni, congiunzioni, pronomi, ausiliari e simili. La radice comune deve avere almeno 5 lettere e i suffissi degli aggettivi non si tolgono: lavoro e lavorare, viaggio e viaggiare contano come ripetizione, porta e portato, parte e partita, venti e vento, banco e banca, pesca e pescare, capitale e capito no. Nella pagina le colora, dove si può; a fine lettura evidenziazione, elenco delle parole della pagina e foglio di stile si tolgono. Niente grammatica e niente stile.
- Partenza più rapida: con l'opzione "Tieni la voce pronta" (accesa in partenza, spenta sui computer con meno di 8 GB) il motore resta caricato 30 minuti dall'ultima lettura finché Chrome è in uso, e si libera dopo 10 minuti se in Chrome non cambia scheda, finestra o pagina. Prima si liberava sempre dopo 10 minuti. Con la scorciatoia e il menu il motore comincia a caricarsi subito, insieme alla lettura della selezione. Nessun permesso nuovo. Misure sul PC di prova con la CPU libera (build di produzione, velocità 1,1): con il motore pronto il primo suono arriva in circa 1,0 secondi (1,05 a pannello aperto); da freddo, cioè con il motore da caricare, 2,3-2,6 secondi contro 2,3-3,1 della 1.2.2. Il motore pronto occupa circa 1,2 GB di memoria, senza motore l'estensione circa 0,35 GB (uguale alla 1.2.2): opzioni di sessione diverse non riducono né il caricamento (circa 1,2-1,5 secondi) né la memoria.
- Accenti: le parole scritte con l'apostrofo al posto dell'accento si leggono accentate ("perche'" perché, "citta'" città, "E'" È, "puo'" può, "com'e'" com'è, "ne'" né), anche con l'apostrofo tipografico. Restano come sono le elisioni (l'albero, un'altra), i troncamenti (po', va', di', mo') e gli apici che chiudono una citazione, anche quando la parola citata finisce con una consonante ('ok', 'film', 'sport') o con un segno ('Basta!'); una citazione rimasta aperta si chiude a fine frase e a capo, e l'apice tipografico dopo un'elisione (l'‘albero’) la apre. Prima eSpeak sbagliava l'accento ("perche'" letto pèrche).
- Cambio di scheda durante la lettura (segnalato nella prova della 1.3.0: la lettura si era fermata). Nel codice nessuna pausa è legata alla scheda: la pausa arriva solo dal pulsante della barretta, dal pannello o da Alt+Q senza selezione mentre si legge. In headless né la 1.3.0 né la 1.2.2 si fermano cambiando scheda, anche con la scheda congelata come fa Chrome con le schede in secondo piano: l'audio avanza di 20 secondi in 20 secondi. L'unico modo in cui il browser può fermare il suono senza passare dalla pausa è sospendere il contesto audio dell'offscreen: ora, se succede durante una lettura che l'utente non ha messo in pausa, l'audio riprende subito (provato sospendendolo apposta: la lettura continua). Prima la 1.3.0 continuava anche a evidenziare e a scorrere la scheda nascosta e, al ritorno, poteva restare indietro di una frase: corretto (vedi sopra).
- Elisione davanti a un numero: "l'8 settembre" si legge "l'otto settembre" e non più "elle otto settembre", anche con dell', all', nell', dall', sull', coll', quell', e "l'11" l'undici, "l'80%" l'ottanta per cento, "nell'800" nell'ottocento, "l'8.000" l'ottomila, "dell'1,5" dell'uno virgola 5. L'apostrofo resta solo se il numero in lettere comincia per vocale; "l'1 gennaio" si legge "il primo gennaio", "un'8" "un otto"; gli altri casi ("l'2", "l'18") restano come prima, e "'90", gli apici e "5' 30''" non cambiano. Difetto vecchio: la 1.2.2 leggeva già "elle otto".
- Segni di confronto davanti a un numero letti: "> 18 anni" maggiore di 18 anni, "<5" minore di 5, "≥" e ">=" maggiore o uguale a, "≤" e "<=" minore o uguale a. "<3" attaccato al 3 è un cuore e si toglie ("Ti amo <3 tanto"), salvo quando segue un'unità o un conteggio ("<3 anni", "<3%") o altre cifre ("<30", "<3,5").
- A capo e pulsanti (dalla 1.2.3): "più" e "come" non uniscono più due righe, così "Scopri di più / Leggi tutto" restano separati; il ">" a inizio riga si toglie solo nelle mail citate: un blocco di almeno due righe consecutive col ">" in cui almeno metà delle righe non comincia con un numero ("> 2024 è stato…" dentro una mail non diventa più "maggiore di 2024"), oppure righe citate sparse che sono la maggioranza; un elenco fatto per lo più di "> numero" ("> 18 anni / > 5 anni / > patente B") resta un confronto; una riga lunga senza punto seguita da una minuscola continua anche nei testi corti.
- Catture per lo store (dalla 1.2.3): lo screenshot 2 si prende con pagina e pannello durante la stessa lettura, finché lo stato è identico prima e dopo. Le immagini si rigenerano al rilascio.
- Verifiche: test:funzioni 97 su 97 (con i casi della revisione: mail citate, apici, cuore, radici), fonemi 44 su 44, prove nel browser delle novità 16 su 16 (21 su 21 con le sei pagine vere prima della revisione), funzioni 23 su 23, TinyMCE vero compreso. Voce pronta nel tempo: dopo una lettura e 20 minuti di cambi di scheda simulati il documento offscreen è ancora aperto, la lettura successiva parte con il primo suono a 0,86 secondi e la memoria dell'istanza resta fra 1,28 e 1,35 GB. Misure A/B 1.2.2 e 1.3.0 alternate sullo stesso PC: primo suono a caldo, a pannello aperto e pause uguali (una pausa sotto 1 secondo sull'articolo di 1.043 parole, una da 1,8 secondi sul testo a righe).


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
