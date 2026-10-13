# Registro delle modifiche

Ogni modifica all'estensione, anche minima, fa avanzare la versione: patch per le correzioni,
minor per le funzioni nuove. La versione vive solo in `src/manifest.json`; ogni versione ha qui
la sua voce e un tag git `vX.Y.Z`.

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
