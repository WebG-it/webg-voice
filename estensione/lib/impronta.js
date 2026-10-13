// Impronta corta del testo (djb2): serve a riconoscere "stesso testo" senza
// far circolare il testo nei messaggi di stato.
export function impronta(t) {
  let h = 5381;
  const s = String(t || '').trim();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + s.length;
}
