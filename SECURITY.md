# Sicurezza

## Come segnalare una vulnerabilità

Non aprire una issue pubblica. Usa una di queste due strade:

- la segnalazione privata di GitHub: scheda **Security** del repository → **Report a vulnerability**;
- una email a **info@webg.it** con oggetto **"WebG Voice, sicurezza"**.

Descrivi il problema, la versione dell'estensione (si vede nel popup) e, se puoi, i passi per
riprodurlo. Rispondiamo entro **7 giorni lavorativi** con una prima valutazione e, se il problema è
confermato, concordiamo i tempi della correzione e della divulgazione.

## Ambito

Rientrano:
- il codice dell'estensione (`src/`, la build in `estensione/`) e gli script di build e rilascio;
- il download e la verifica dei file del modello (sorgenti, impronte SHA-256, archivio locale);
- i permessi richiesti e la gestione dei messaggi fra le parti dell'estensione.

Non rientrano:
- vulnerabilità di Chrome, di ONNX Runtime Web, di eSpeak NG o del modello Kokoro in sé
  (segnalale ai rispettivi progetti; se riguardano il modo in cui li usiamo, scrivici);
- i siti di terzi su cui l'estensione legge il testo.

## Versioni supportate

Si corregge sempre l'ultima versione pubblicata sul Chrome Web Store.

---

Report vulnerabilities privately via GitHub's **Security → Report a vulnerability** or by email to
info@webg.it with the subject "WebG Voice, sicurezza". We reply within 7 working days.
