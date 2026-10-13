#!/usr/bin/env bash
# Compila eSpeak NG 1.52.0 (la stessa versione di espeakng_loader 0.2.4, usata da
# kokoro-onnx in Python) in WebAssembly, solo per la conversione testo -> fonemi.
# Serve solo per rigenerare vendor/espeak/espeak-ng.{mjs,wasm}: il risultato e'
# gia' nel repository.
#
# Uso: scripts/compila-espeak.sh <cartella emsdk> <cartella di lavoro>
# (Git Bash su Windows va bene; emsdk installato e attivato con "emsdk install/activate latest")
set -euo pipefail
EMSDK="$(cygpath -m "$1" 2>/dev/null || echo "$1")"; LAVORO="$2"
QUI="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
mkdir -p "$LAVORO" && cd "$LAVORO"
[ -d espeak-ng ] || git clone --depth 1 --branch 1.52.0 https://github.com/espeak-ng/espeak-ng.git
mkdir -p cfg
cat > cfg/config.h <<'EOF'
#define HAVE_MKSTEMP 1
#define USE_ASYNC 0
#define USE_KLATT 0
#define USE_LIBPCAUDIO 0
#define USE_LIBSONIC 0
#define USE_MBROLA 0
#define USE_SPEECHPLAYER 0
#define PACKAGE_VERSION "1.52.0"
EOF
# Con la libc di Emscripten <wchar.h> ridichiara iswupper & c., che compat/wctype.h
# ha gia' trasformato in macro ucd_*: le togliamo durante l'include e le rimettiamo.
M="iswalnum:ucd_isalnum iswalpha:ucd_isalpha iswblank:ucd_isblank iswcntrl:ucd_iscntrl iswdigit:ucd_isdigit iswgraph:ucd_isgraph iswlower:ucd_islower iswprint:ucd_isprint iswpunct:ucd_ispunct iswspace:ucd_isspace iswupper:ucd_isupper iswxdigit:ucd_isxdigit"
{
  echo '#pragma GCC system_header'
  echo '#ifdef WCTYPE_H_COMPAT_SHIM'
  for c in $M; do echo "#undef ${c%%:*}"; done
  echo '#endif'
  echo '#include_next <wchar.h>'
  echo '#ifdef WCTYPE_H_COMPAT_SHIM'
  for c in $M; do echo "#define ${c%%:*} ${c##*:}"; done
  echo '#endif'
} > cfg/wchar.h
E=espeak-ng/src
SRC="common mnemonics error ieee80 compiledata compiledict dictionary encoding intonation langopts numbers phoneme phonemelist readclause setlengths soundicon spect ssml synthdata synthesize tr_languages translate translateword voices wavegen speech espeak_api"
FILES=""
for f in $SRC; do FILES="$FILES $E/libespeak-ng/$f.c"; done
for f in case categories ctype proplist scripts tostring; do FILES="$FILES $E/ucd-tools/src/$f.c"; done
export MSYS_NO_PATHCONV=1
EMCC="python $EMSDK/upstream/emscripten/emcc.py"
mkdir -p "$QUI/vendor/espeak"
$EMCC -O2 -fwrapv -Icfg -I$E/include -I$E/include/compat -I$E/ucd-tools/src/include \
  -DLIBESPEAK_NG_EXPORT=1 '-DPATH_ESPEAK_DATA="/espeak-ng-data"' \
  $FILES \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=creaEspeak \
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=_espeak_Initialize,_espeak_SetVoiceByName,_espeak_TextToPhonemes,_espeak_Info,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=FS,cwrap,setValue,getValue,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -o "$QUI/vendor/espeak/espeak-ng.mjs"
ls -la "$QUI/vendor/espeak"
