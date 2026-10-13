# Registro delle modifiche

Ogni modifica all'estensione, anche minima, fa avanzare la versione: patch per le correzioni,
minor per le funzioni nuove. La versione vive solo in `src/manifest.json`; ogni versione ha qui
la sua voce e un tag git `vX.Y.Z`.

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
