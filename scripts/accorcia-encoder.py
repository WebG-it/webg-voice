# Ritocca l'encoder ONNX di Whisper perche' accetti finestre piu' corte di 30 secondi
# (come audio_ctx di whisper.cpp): con una frase di 4 secondi l'encoder lavora su 5 secondi
# invece che su 30, e costa circa un ottavo. I pesi non cambiano, cambia solo il grafo:
#  1. le posizioni (embed_positions, 1500 righe) si tagliano alla lunghezza dell'ingresso;
#  2. le forme fisse a 1500 nei Reshape diventano 0 ("copia la dimensione dall'ingresso");
#  3. la lunghezza dell'ingresso (alcune esportazioni la fissano a 3000) diventa libera;
#  4. le forme intermedie salvate (valide solo per 1500) si tolgono, ONNX Runtime le ricava.
# Uso: python scripts/accorcia-encoder.py encoder_model_int8.onnx encoder_model_int8_corto.onnx
# Serve: pip install onnx numpy
import sys

import numpy as np
import onnx
from onnx import helper, numpy_helper

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph

somma = next(n for n in g.node if n.op_type == 'Add' and 'embed_positions.weight' in n.input)
x = [i for i in somma.input if i != 'embed_positions.weight'][0]
P = 'accorcia/'
g.initializer.extend([
    numpy_helper.from_array(np.array([1], dtype=np.int64), P + 'uno'),
    numpy_helper.from_array(np.array([2], dtype=np.int64), P + 'due'),
    numpy_helper.from_array(np.array([0], dtype=np.int64), P + 'zero'),
])
nuovi = [
    helper.make_node('Shape', [x], [P + 'forma'], name=P + 'Shape'),
    helper.make_node('Slice', [P + 'forma', P + 'uno', P + 'due', P + 'zero'], [P + 'lung'], name=P + 'SliceLen'),
    helper.make_node('Slice', ['embed_positions.weight', P + 'zero', P + 'lung', P + 'zero'], [P + 'pos'], name=P + 'SlicePos'),
]
i = list(g.node).index(somma)
for k, n in enumerate(nuovi):
    g.node.insert(i + k, n)
somma.input[list(somma.input).index('embed_positions.weight')] = P + 'pos'

d = g.output[0].type.tensor_type.shape.dim[1]
d.ClearField('dim_value')
d.dim_param = 'encoder_sequence_length_out'

costanti = {n.output[0]: n for n in g.node if n.op_type == 'Constant'}
iniziali = {t.name: t for t in g.initializer}
ritoccati = 0
for n in g.node:
    if n.op_type != 'Reshape':
        continue
    s = n.input[1]
    if s in iniziali:
        a = numpy_helper.to_array(iniziali[s])
        if 1500 in a.tolist():
            iniziali[s].CopyFrom(numpy_helper.from_array(np.where(a == 1500, 0, a).astype(a.dtype), s))
            ritoccati += 1
    elif s in costanti:
        attr = next(a for a in costanti[s].attribute if a.name == 'value')
        a = numpy_helper.to_array(attr.t)
        if 1500 in a.tolist():
            attr.t.CopyFrom(numpy_helper.from_array(np.where(a == 1500, 0, a).astype(a.dtype)))
            ritoccati += 1

for dd in g.input[0].type.tensor_type.shape.dim[2:3]:
    dd.ClearField('dim_value')
    dd.dim_param = 'encoder_sequence_length'

g.ClearField('value_info')
onnx.save(m, dst)
print(f'{dst}: posizioni tagliate, {ritoccati} Reshape ritoccati')
