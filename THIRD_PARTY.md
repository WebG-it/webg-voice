# Componenti di terze parti

WebG Voice è distribuita con licenza GPL-3.0-or-later (testo in `LICENSE`), perché include
eSpeak NG. Codice sorgente completo, script di build e storia delle modifiche:
https://github.com/WebG-it/webg-voice

I percorsi indicati sotto sono quelli del pacchetto dell'estensione.

## Kokoro-82M (modello e voci `if_sara` e `im_nicola`)

- Autore: hexgrad, https://huggingface.co/hexgrad/Kokoro-82M
- Esportazione ONNX: onnx-community, https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
  (revisione `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, file `onnx/model.onnx`, `voices/if_sara.bin`
  e `voices/im_nicola.bin`)
- Licenza: Apache License 2.0, testo completo in `LICENSE-APACHE-2.0.txt`.
- Il modello e le voci non sono nel pacchetto: modello e voce Sara si scaricano al primo avvio,
  la voce Nicola la prima volta che l'utente la sceglie, dalla release `model-v1` del
  repository GitHub (copia identica, stessa impronta SHA-256) o, in riserva, da Hugging Face.
- `lib/vocab.js` contiene il vocabolario dei fonemi tratto dalla configurazione di Kokoro
  (Apache-2.0, `LICENSE-APACHE-2.0.txt`).

## Mozilla Readability 0.6.0

- Mozilla Foundation (originariamente Arc90), https://github.com/mozilla/readability
- Licenza: Apache License 2.0 (`vendor/readability/LICENSE.md`, testo completo in
  `LICENSE-APACHE-2.0.txt`). File: `vendor/readability/Readability.js`, identico a quello del
  pacchetto npm `@mozilla/readability` 0.6.0 (SHA-256 `34dcab3d0832d0019f02990eed6b6124e029e8c32b9f0c6f2550544ff8dff174`).
- Serve a trovare l'articolo nella pagina quando l'utente chiede di leggerlo tutto: si inietta
  solo in quel momento, nella scheda autorizzata dall'utente.

## lamejs 1.2.1 (codificatore MP3)

- Alex Zhukov, https://github.com/zhuker/lamejs, porting in JavaScript di LAME (https://lame.sourceforge.io).
- Licenza: GNU LGPL versione 3 (`vendor/lame/COPYING.LESSER`, con la GPL-3.0 in `LICENSE`;
  nota degli autori in `vendor/lame/LICENSE-lamejs.txt`). File: `vendor/lame/lame.all.js`, la
  versione non minificata del pacchetto npm `lamejs` 1.2.1, senza modifiche
  (SHA-256 `026bd88846040f357a937cd85821a48492a362eff0812cda734f23fca55fea3b`): il file stesso è
  il sorgente corrispondente e si può sostituire con un'altra versione compatibile.
- Gira in un Web Worker separato (`mp3-worker.js`) e serve solo a creare i file MP3, sul computer
  dell'utente.

## ONNX Runtime Web 1.30.0

- Microsoft, https://github.com/microsoft/onnxruntime
- Licenza: MIT. File: `vendor/ort/ort.wasm.min.mjs`, `vendor/ort/ort-wasm-simd-threaded.mjs`,
  `vendor/ort/ort-wasm-simd-threaded.wasm` (dal pacchetto npm `onnxruntime-web`).

```
MIT License
Copyright (c) Microsoft Corporation.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## eSpeak NG 1.52.0

- https://github.com/espeak-ng/espeak-ng, tag `1.52.0` (commit `4870adfa25b1a32b4361592f1be8a40337c58d6c`)
- Licenza: GNU GPL versione 3 o successiva, testo in `vendor/espeak/COPYING`.
- `vendor/espeak/espeak-ng.mjs` e `vendor/espeak/espeak-ng.wasm` sono compilati dal sorgente
  originale, senza modifiche al codice, con lo script `scripts/compila-espeak.sh` del repository
  GitHub indicato sopra (Emscripten; l'unico accorgimento è un header di compatibilità per
  `wchar.h`, generato dallo script stesso).
- `vendor/espeak/espeak-dati.bin` contiene, senza modifiche, i file di `espeak-ng-data` della
  stessa versione necessari all'italiano (tabelle dei fonemi, dizionari `it` ed `en`, definizioni
  delle voci); l'indice è in `vendor/espeak/espeak-dati.json`. Si rigenera con lo script
  `scripts/dati-espeak.mjs` del repository.
- Il sorgente corrispondente è quello del tag indicato sopra.
