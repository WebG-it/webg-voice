# Componenti di terze parti

WebG Voice è distribuita con licenza GPL-3.0-or-later (vedi `LICENSE`), perché include
eSpeak NG. Questi sono i componenti di terze parti, con le loro licenze.

## Kokoro-82M (modello e voce `if_sara`)

- Autore: hexgrad, https://huggingface.co/hexgrad/Kokoro-82M
- Esportazione ONNX: onnx-community, https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
  (revisione `1939ad2a8e416c0acfeecc08a694d14ef25f2231`, file `onnx/model.onnx` e `voices/if_sara.bin`)
- Licenza: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
- Il modello non è incluso nell'estensione: si scarica al primo uso dalla release `model-v1`
  di questo repository (copia identica, stessa impronta SHA-256) o, in riserva, da Hugging Face.
- Il vocabolario dei fonemi in `src/lib/vocab.js` viene dalla configurazione di Kokoro (Apache-2.0).

## ONNX Runtime Web 1.30.0

- Microsoft, https://github.com/microsoft/onnxruntime
- Licenza: MIT. File inclusi: `vendor/ort/ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`,
  `ort-wasm-simd-threaded.wasm` (copiati dal pacchetto npm `onnxruntime-web` da `npm run build`).

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

- https://github.com/espeak-ng/espeak-ng (tag `1.52.0`)
- Licenza: GNU GPL versione 3 o successiva, testo in `vendor/espeak/COPYING`.
- `vendor/espeak/espeak-ng.mjs` e `espeak-ng.wasm` sono compilati dal sorgente originale, senza
  modifiche al codice, con `scripts/compila-espeak.sh` (Emscripten; l'unico accorgimento è un
  header di compatibilità per `wchar.h`, generato dallo script stesso).
- `vendor/espeak/espeak-dati.bin` contiene, senza modifiche, i file di `espeak-ng-data` della
  stessa versione necessari all'italiano (tabelle dei fonemi, dizionari `it` ed `en`, definizioni
  delle voci); l'indice è in `espeak-dati.json`. Si rigenera con `scripts/dati-espeak.mjs`.
- Il sorgente corrispondente è quello del tag `1.52.0` indicato sopra.
