#!/usr/bin/env bash
# Pubblica il modello e le voci come asset della release "model-v1" del repository GitHub.
# Scarica i file dalla revisione fissata di Hugging Face, controlla l'impronta
# SHA-256 (la stessa che controlla l'estensione, src/lib/modelli.js) e carica con gh
# solo i file che nella release mancano: quelli gia' pubblicati non si toccano.
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

# nome pubblicato | percorso su Hugging Face | sha256
FILE=(
  "kokoro-v1.0-fp32.onnx|onnx/model.onnx|8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb"
  "if_sara.bin|voices/if_sara.bin|409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c"
  "im_nicola.bin|voices/im_nicola.bin|bc578e510d52a96d6940d46f12e96d7b3df00905dbea075113226d100e6e1ab0"
)

NOTE="Modello per WebG Voice: Kokoro-82M v1.0 (hexgrad), esportazione ONNX fp32 di onnx-community
(revisione $REV), e stili delle voci if_sara (Sara) e im_nicola (Nicola). Licenza Apache-2.0.
Copia identica dei file originali, verificata con SHA-256:
- kokoro-v1.0-fp32.onnx  8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb
- if_sara.bin            409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c
- im_nicola.bin          bc578e510d52a96d6940d46f12e96d7b3df00905dbea075113226d100e6e1ab0
Fonte: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX"

ESISTENTI=""
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  ESISTENTI="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name')"
else
  gh release create "$TAG" --repo "$REPO" --title "Modello Kokoro per WebG Voice (v1)" --notes "$NOTE" --latest=false
fi

for riga in "${FILE[@]}"; do
  IFS='|' read -r nome percorso impronta <<<"$riga"
  if grep -qx "$nome" <<<"$ESISTENTI"; then
    echo "$nome gia' pubblicato, non lo tocco."
    continue
  fi
  echo "Scarico $nome…"
  curl -fL --retry 3 -o "$LAVORO/$nome" "$HF/$percorso"
  echo "$impronta  $LAVORO/$nome" | sha256sum -c -
  gh release upload "$TAG" --repo "$REPO" "$LAVORO/$nome"
done
gh release edit "$TAG" --repo "$REPO" --notes "$NOTE" >/dev/null

# Verifica: i file pubblicati devono rispondere anche a pezzi e avere la stessa impronta
for riga in "${FILE[@]}"; do
  IFS='|' read -r nome percorso impronta <<<"$riga"
  URL="https://github.com/$REPO/releases/download/$TAG/$nome"
  echo "Controllo $URL"
  curl -fsSL -r 0-99 -o /dev/null -w "  richiesta a pezzi: HTTP %{http_code}\n" "$URL"
  case "$nome" in
    *.bin)
      letta="$(curl -fsSL "$URL" | sha256sum | cut -d' ' -f1)"
      [ "$letta" = "$impronta" ] && echo "  impronta SHA-256 corretta" || { echo "  IMPRONTA DIVERSA: $letta" >&2; exit 1; }
      ;;
  esac
done
echo "Fatto. L'estensione usera' questi file come sorgente primaria."
