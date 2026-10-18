"""Costruisce l'audio di prova di una "call": due file wav a 16 kHz mono che si alternano.

  python test/call/costruisci-audio.py <cartella frasi Call> <cartella frasi Io> <uscita> [n turni]

Le frasi sono wav a 16 kHz mono numerati 01.wav, 02.wav... In `call.wav` parlano gli altri (le frasi
della prima cartella), in `io.wav` parla chi trascrive (la seconda cartella): i turni si alternano
con una pausa, e dove uno parla l'altro e' in silenzio. Scrive anche `turni.json` con l'ordine.
"""
import json
import sys
import wave

import numpy as np

SR = 16000


def leggi(p):
    with wave.open(p) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1, p
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def scrivi(p, y):
    with wave.open(p, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.astype(np.int16).tobytes())


call_dir, io_dir, uscita = sys.argv[1:4]
n = int(sys.argv[4]) if len(sys.argv) > 4 else 8
pausa = np.zeros(int(1.5 * SR), dtype=np.int16)
call, io, turni = [np.zeros(2 * SR, dtype=np.int16)], [np.zeros(2 * SR, dtype=np.int16)], []
t = 2.0
for i in range(n):
    fonte = 'Call' if i % 2 == 0 else 'Io'
    idx = i // 2 + 1
    id_ = f'{idx:02d}'
    y = leggi(f'{call_dir if fonte == "Call" else io_dir}/{id_}.wav')
    silenzio = np.zeros(len(y), dtype=np.int16)
    (call if fonte == 'Call' else io).append(y)
    (io if fonte == 'Call' else call).append(silenzio)
    for L in (call, io):
        L.append(pausa)
    turni.append({'fonte': fonte, 'frase': id_, 'inizio': round(t, 2), 'durata': round(len(y) / SR, 2)})
    t += len(y) / SR + 1.5
scrivi(f'{uscita}/call.wav', np.concatenate(call))
scrivi(f'{uscita}/io.wav', np.concatenate(io))
json.dump({'durata': round(t, 2), 'turni': turni}, open(f'{uscita}/turni.json', 'w'), indent=1)
print('durata', round(t, 1), 's,', n, 'turni')
