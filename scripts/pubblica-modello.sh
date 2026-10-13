#!/usr/bin/env bash
# Pubblica il modello come asset della release "model-v1" del repository GitHub.
# Scarica i file dalla revisione fissata di Hugging Face, controlla l'impronta
# SHA-256 (la stessa che controlla l'estensione) e li carica con gh.
#
# Uso: scripts/pubblica-modello.sh [owner/repo]   (default WebG-it/webg-voice)
# Serve: gh autenticato con permesso di scrittura sul repository, curl, sha256sum.
set -euo pipefail
REPO="${1:-WebG-it/webg-voice}"
TAG="model-v1"
REV="1939ad2a8e416c0acfeecc08a694d14ef25f2231"
HF="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/$REV"
LAVORO="$(mktemp -d)"
trap 'rm -rf "$LAVORO"' EXIT

scarica() { # url  nome  sha256
  echo "Scarico $2…"
  curl -fL --retry 3 -o "$LAVORO/$2" "$1"
  echo "$3  $LAVORO/$2" | sha256sum -c -
}
scarica "$HF/onnx/model.onnx" "kokoro-v1.0-fp32.onnx" "8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb"
scarica "$HF/voices/if_sara.bin" "if_sara.bin" "409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c"

NOTE="Modello per WebG Voice: Kokoro-82M v1.0 (hexgrad), esportazione ONNX fp32 di onnx-community
(revisione $REV), e stile della voce if_sara. Licenza Apache-2.0.
Copia identica dei file originali, verificata con SHA-256:
- kokoro-v1.0-fp32.onnx  8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb
- if_sara.bin            409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c
Fonte: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" --repo "$REPO" --clobber "$LAVORO/kokoro-v1.0-fp32.onnx" "$LAVORO/if_sara.bin"
else
  gh release create "$TAG" --repo "$REPO" --title "Modello Kokoro per WebG Voice (v1)" --notes "$NOTE" --latest=false \
    "$LAVORO/kokoro-v1.0-fp32.onnx" "$LAVORO/if_sara.bin"
fi

# Verifica: i file pubblicati devono avere la stessa impronta, anche scaricati a pezzi
for n in if_sara.bin kokoro-v1.0-fp32.onnx; do
  URL="https://github.com/$REPO/releases/download/$TAG/$n"
  echo "Controllo $URL"
  curl -fsSL -r 0-99 -o /dev/null -w "  richiesta a pezzi: HTTP %{http_code}\n" "$URL"
done
curl -fsSL "https://github.com/$REPO/releases/download/$TAG/if_sara.bin" | sha256sum
echo "Fatto. L'estensione usera' questi file come sorgente primaria."
