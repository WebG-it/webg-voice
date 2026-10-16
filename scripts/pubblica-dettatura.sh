#!/usr/bin/env bash
# Pubblica i modelli Whisper della dettatura come asset della release "dettatura-v1".
# Scarica i file dalle revisioni fissate di Hugging Face (onnx-community), ritocca gli encoder
# perche' accettino finestre corte (scripts/accorcia-encoder.py), controlla l'impronta SHA-256
# (la stessa che controlla l'estensione, src/lib/modelli-dettatura.js) e carica con gh solo i
# file che nella release mancano: quelli gia' pubblicati non si toccano.
#
# Uso: scripts/pubblica-dettatura.sh [owner/repo]   (default WebG-it/webg-voice)
# Serve: gh autenticato con permesso di scrittura, curl, sha256sum, python con onnx e numpy.
set -euo pipefail
REPO="${1:-WebG-it/webg-voice}"
TAG="dettatura-v1"
QUI="$(cd "$(dirname "$0")" && pwd)"
LAVORO="$(mktemp -d)"
trap 'rm -rf "$LAVORO"' EXIT

HF="https://huggingface.co/onnx-community"
SMALL="$HF/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732"
BASE="$HF/whisper-base/resolve/1846881b6b3a3024392c1eea3ad983695bc23925"
TURBO="$HF/whisper-large-v3-turbo/resolve/360ebcde2559d60bb474678be3c1de9ef347d01a"

# nome pubblicato | url di origine | ritocco (corto o -) | sha256 del file pubblicato
FILE=(
  "whisper-base-encoder-int8-corto.onnx|$BASE/onnx/encoder_model_int8.onnx|corto|3fbe58b61c83afc4fe92f5d6139d22d6b56877b9efb45f383a57503ac824b3d1"
  "whisper-base-decoder-int8.onnx|$BASE/onnx/decoder_model_merged_int8.onnx|-|fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b"
  "whisper-small-encoder-int8-corto.onnx|$SMALL/onnx/encoder_model_int8.onnx|corto|38bbd0b13f0e8bca6bce6dd1320ae0ca19c8dfa5b19989136c43dec563cf38ca"
  "whisper-small-decoder-int8.onnx|$SMALL/onnx/decoder_model_merged_int8.onnx|-|ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9"
  "whisper-tokenizer.json|$SMALL/tokenizer.json|-|27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"
  "whisper-turbo-encoder-q4f16-corto.onnx|$TURBO/onnx/encoder_model_q4f16.onnx|corto|3b3a134ac40599497ab84cdf17b5d002077a9b8e57c40b1eee628dfa28d353d5"
  "whisper-turbo-decoder-q4f16.onnx|$TURBO/onnx/decoder_model_merged_q4f16.onnx|-|45981cdd958a4c8e1447839850d2e6e27e30974ccbe31b4a1e5ebe9ad8965a5f"
  "whisper-turbo-tokenizer.json|$TURBO/tokenizer.json|-|6d8cbd7cd0d8d5815e478dac67b85a26bbe77c1f5e0c6d76d1ce2abc0e5f21ca"
)

NOTE="Modelli per la dettatura di WebG Voice: Whisper di OpenAI (licenza MIT), esportazioni ONNX di
onnx-community a revisione fissata (whisper-base, whisper-small, whisper-large-v3-turbo).
Decoder e tokenizzatori sono copie identiche degli originali. Gli encoder sono ritoccati con
scripts/accorcia-encoder.py del repository (stessi pesi, grafo che accetta finestre piu' corte
di 30 secondi): il risultato e' riproducibile e l'impronta SHA-256 e' quella nell'estensione,
src/lib/modelli-dettatura.js."

ESISTENTI=""
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  ESISTENTI="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name')"
else
  gh release create "$TAG" --repo "$REPO" --title "Modelli Whisper per la dettatura di WebG Voice (v1)" --notes "$NOTE" --latest=false
fi

for riga in "${FILE[@]}"; do
  IFS='|' read -r nome url ritocco impronta <<<"$riga"
  if grep -qx "$nome" <<<"$ESISTENTI"; then
    echo "$nome gia' pubblicato, non lo tocco."
    continue
  fi
  echo "Scarico $nome…"
  curl -fL --retry 3 -o "$LAVORO/originale" "$url"
  if [ "$ritocco" = corto ]; then
    python "$QUI/accorcia-encoder.py" "$LAVORO/originale" "$LAVORO/$nome"
    rm -f "$LAVORO/originale"
  else
    mv "$LAVORO/originale" "$LAVORO/$nome"
  fi
  echo "$impronta  $LAVORO/$nome" | sha256sum -c -
  gh release upload "$TAG" --repo "$REPO" "$LAVORO/$nome"
  rm -f "$LAVORO/$nome"
done
gh release edit "$TAG" --repo "$REPO" --notes "$NOTE" >/dev/null

for riga in "${FILE[@]}"; do
  IFS='|' read -r nome _ _ _ <<<"$riga"
  URL="https://github.com/$REPO/releases/download/$TAG/$nome"
  curl -fsSL -r 0-99 -o /dev/null -w "$nome: richiesta a pezzi HTTP %{http_code}\n" "$URL"
done
echo "Fatto."
