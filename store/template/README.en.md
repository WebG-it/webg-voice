# {{NOME_BREVE}}

**{{NOME}}** is the Chrome extension by [WebG](https://www.webg.it) that brings voice into the
browser in three ways, in Italian and entirely on your computer:

1. **Read**: reads the selected text or a whole article aloud with a natural Italian voice (Sara or
   Nicola, Kokoro-82M model), and can save it as MP3.
2. **Dictate**: types what you say into the field where your cursor is, already cleaned up (Whisper).
3. **Transcribe a call**: transcribes calls made in the browser, tab audio and microphone, and saves
   the text with timestamps, exportable as Word, TXT or SRT subtitles (Parakeet).

No account, no subscription, no text or audio sent to external services, except for two optional choices, off by default: Google speech recognition for dictation and an "online" system voice picked by hand for reading. After the first
download it also works offline. The interface is in Italian.

Version {{VERSIONE}}, released {{DATA_ISO}} (changes in the [CHANGELOG](CHANGELOG.md), in Italian).

*Versione italiana: [README.md](README.md).*

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/detail/ekblhgobhioceolefpbjbebjdhgbkpdm)
or, to try it from source:

1. Download this repository (or a release zip) and open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** and choose the `estensione` folder.

On first install a **welcome page** opens with the three features, the shortcuts, a voice test and
the download sizes. The full **guide** is in the panel, behind the question mark. To keep it handy:
puzzle icon at the top right of Chrome, pin next to WebG Voice.

## The three features, step by step

### 1. Read (Leggi)

1. Select text on a page and press **Alt+Q**, or right-click → **Leggi ad alta voce**.
2. With nothing selected, **Alt+Q** reads the whole article (title and text, without menus, ads and
   comments). Right-click on the page also offers **Leggi tutto l'articolo**.
3. **Alt+Q** again pauses and resumes, **Alt+W** stops.
4. While reading, the sentence you hear is highlighted on the page and a small bar at the bottom
   right offers pause, stop and speed.

From the panel: voice (Sara or Nicola), speed from 0.7 to 1.5, **Di nuovo** (reads the last text
again from the start), **Leggi un testo incollato** (pasted text), **Crea MP3**, **Rileggi la bozza**
(proofreading: slower, with repeated words listed).

### 2. Dictate (Detta)

1. Click in the field where you want to write (Gmail, WhatsApp Web, Claude.ai, a form, a CMS editor).
2. Hold **Ctrl+Space** while you speak: on release the text is typed. A short tap keeps listening
   hands-free until you press again or say «fine dettatura».
3. The first time Chrome asks for the microphone and the model suited to your computer is downloaded.

Punctuation, new lines and lists are spoken in Italian («virgola», «a capo», «elenco puntato»);
hesitations and repetitions are removed automatically.

### 3. Transcribe a call (Trascrivi la call)

1. Open the call in a Chrome tab (Meet, Teams, Zoom in the browser).
2. WebG Voice panel → **Trascrivi la call**. The first time Chrome asks for two optional
   permissions (tab audio, saving the file) and the model is downloaded.
3. Tick that you will tell the participants and press **Inizia**: a red bar appears in the tab.
4. At the end press **Ferma e salva**: the `.md` file goes to `Downloads/WebG Voice`. From the panel
   you can also export it as **TXT**, **DOCX** (Word) or **SRT** (subtitles).

"Io" is your microphone, "Call" is the tab audio (everyone else together). It recognises English as
well as Italian.

## Shortcuts

| Action | Windows and Linux | Mac |
|---|---|---|
| Read, pause and resume | Alt+Q | Control+Q |
| Stop reading | Alt+W | Control+W |
| Dictate (hold, or short tap) | Ctrl+Space | Control+Shift+X |

Change them at `chrome://extensions/shortcuts` (button **Cambia le scorciatoie** on the welcome page,
in the guide and in the settings). Updating keeps your previous shortcuts.

## Requirements and model sizes

- Chrome 116 or later.
- Memory: reading with the voice kept ready uses about 1.2 GB; call transcription about 2.5 GB while
  it runs. Transcription needs at least 8 GB of RAM, 16 GB recommended.
- The Quality dictation model uses the graphics card (WebGPU).

| What | Downloaded when | Size |
|---|---|---|
| Voice Sara (reading) | At install, in the background; asks first on metered connections | {{MB}} MB |
| Voice Nicola | The first time you pick it | 0.5 MB |
| Balanced voice (Kokoro uint8) | Only if the computer is slow at reading | 177 MB |
| Dictation Light / Normal / Quality | At the first dictation, the one chosen | 77 / 250 / 565 MB |
| Call transcription (Parakeet) | The first time you transcribe | 670 MB |

Each file is downloaded once, in resumable chunks, from this repository's releases or from pinned
Hugging Face revisions, with a fixed SHA-256 check.

## FAQ

**A "!" appears and nothing is read.** Chrome does not let extensions into its internal pages, the
Chrome Web Store or the PDF viewer: paste the text into the panel. The same "!" appears when you press
the shortcut with nothing selected on a page without an article.

**The voice sounds metallic.** The computer was too busy and WebG Voice switched to the system voice:
the reading bar says so, with **Voce naturale** to go back to Sara or Nicola. To avoid it: settings,
**Qualità massima**.

**A shortcut is "non impostata" (not set).** Another extension already uses those keys: pick others.

**Ctrl+Space no longer autocompletes in a code editor.** While the extension is active it is used
for dictation; assign it another key if you need it.

**Does it work offline?** Yes, after the first download of each feature.

**Does the transcript tell people apart?** No: "Io" is your microphone, "Call" everyone else.

**How do I free up space?** Dictation page → **Elimina dal computer**; transcription panel →
**Elimina il modello**; removing the extension deletes everything.

## Privacy

The extension collects and sends no data: text stays on your computer, MP3 files are created there,
and dictation and call audio is transcribed locally and never stored. The last text read (for **Di
nuovo**) and the last transcript to export are kept only in memory and disappear when Chrome closes.
The only network connections download voices and models. Two optional exceptions, off by default: on
the dictation page you can choose Chrome's speech recognition, which may send audio to Google; in the
reading options you can pick by hand a system voice marked "online", which sends the text to that
voice's service.
Details in [docs/PRIVACY.md](docs/PRIVACY.md) (Italian).

## Development

```
npm install            # dependencies and commit hooks
npm run build          # rebuilds estensione/ from src/
npm run test:funzioni  # reading pipeline, MP3 (no browser)
npm run test:voci      # system voice and engine choice (no browser)
npm run test:pulizia   # Italian dictation clean-up (no browser)
npm run test:esporta   # transcript to TXT, SRT, DOCX (no browser)
npm run store          # regenerates store texts, privacy policy and both READMEs
```

Browser tests (headless Chrome for Testing only) are described in `test/README.md`. Every change,
however small, bumps the version; the `.githooks/pre-commit` hook enforces it.

## Contact

WebG, https://www.webg.it, info@webg.it, or [GitHub issues](https://github.com/WebG-it/webg-voice/issues).

## License

GPL-3.0-or-later (see `LICENSE`), because the extension bundles eSpeak NG. Kokoro-82M by hexgrad,
Mozilla Readability and the Whisper base and small models (OpenAI) are Apache-2.0, Whisper
large-v3-turbo and ONNX Runtime Web are MIT, Parakeet TDT 0.6B v3 (NVIDIA) is CC-BY-4.0, lamejs is
LGPL-3.0. The Whisper encoders are modified by WebG (same weights): see `THIRD_PARTY.md`.
