// Carico artificiale del processore per le misure della lettura: N fili sempre occupati.
// Si lancia in sottofondo e si chiude per PID quando la misura e' finita.
//   node test/e2e/stress-cpu.mjs <fili>      (stampa il proprio PID)
import { Worker, isMainThread } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
if (isMainThread) {
  const n = Math.max(1, Number(process.argv[2] || 4));
  console.log(`stress PID ${process.pid}, ${n} fili`);
  for (let i = 0; i < n; i++) new Worker(fileURLToPath(import.meta.url));
} else {
  let x = 0;
  for (;;) x = (x * 1.0000001 + Math.sqrt(x + 1)) % 1e9;
}
