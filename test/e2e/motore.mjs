// Scelta automatica del motore della lettura, SOLO headless, profilo con la voce gia' scaricata.
//   npm run build:test
//   CHROME=<chrome for testing> PROFILO=<profilo con la voce> node test/e2e/motore.mjs
// 1. computer lento (rapporto 1,3 misurato): la voce del sistema locale, con l'avviso; pausa, ripresa, stop;
// 2. computer carico (1,0): Kokoro qualita' massima subito, la Bilanciata si scarica in sottofondo e
//    dalla lettura dopo si usa quella (stessa voce, modello uint8);
// 3. computer veloce (0,7): qualita' massima.
import puppeteer from 'puppeteer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = process.env.EXT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'estensione-test');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ko = 0;
const ok = (nome, cond, d) => {
  if (!cond) ko++;
  log(cond ? 'OK ' : 'KO ', nome, d === undefined ? '' : JSON.stringify(d).slice(0, 300));
};
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: process.env.PROFILO, args: ['--no-first-run'] });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('non headless');
}
try {
  const sw = await (await b.waitForTarget((t) => t.type() === 'service_worker')).worker();
  const stato = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stato' }));
        if (r && r.stato) return r.stato;
      } catch {}
      await dorme(200);
    }
    throw new Error('offscreen muto');
  };
  const attendi = async (c, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify({ fase: s.fase, errore: s.errore, motore: s.motoreLettura }));
      await dorme(200);
    }
  };
  const comando = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }), tipo, extra);
  const leggi = (rtf) =>
    sw.evaluate(async (rtf) => {
      await chrome.storage.local.set({ motoreLettura: 'auto', rtf, rtfQuando: Date.now() });
      if (!(await chrome.offscreen.hasDocument()))
        await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS', 'USER_MEDIA'], justification: 'prova' });
    }, rtf);
  const TESTO = 'Prima frase della prova. Seconda frase, un po\' piu\' lunga della prima. Terza frase per finire la prova di lettura.';
  const avviaLettura = async (rtf) => {
    await leggi(rtf);
    await stato();
    // come "leggiTesto" del pannello: le impostazioni le aggiunge il service worker
    await sw.evaluate((t) => globalThis.__testLeggiTesto(t), TESTO);
  };

  // 1. lento: voce del sistema
  await avviaLettura(1.3);
  const s1 = await attendi((s) => s.fase === 'lettura' || s.errore, 30000);
  ok('lento: voce del sistema', s1.motoreLettura === 'sistema' && s1.fase === 'lettura', { motore: s1.motoreLettura, fase: s1.fase, errore: s1.errore });
  ok('lento: avviso nel pannello', /voce del sistema/.test(s1.avvisoMotore || ''), s1.avvisoMotore);
  await comando('pausa');
  await dorme(400);
  const p = (await stato()).fase;
  await comando('riprendi');
  await dorme(400);
  const r = (await stato()).fase;
  ok('lento: pausa e ripresa', p === 'pausa' && r === 'lettura', { p, r });
  const fine = await attendi((s) => s.fase === 'inattivo', 60000);
  ok('lento: arriva in fondo', fine.blocco >= 1 && !fine.errore, { blocco: fine.blocco, totale: fine.totale });

  // 2. carico: qualita' massima subito, Bilanciata in sottofondo, poi Bilanciata
  await avviaLettura(1.0);
  const s2 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
  ok('carico: subito Kokoro qualita massima', s2.motoreLettura === 'massima' && (!s2.info || s2.info.variante !== 'bilanciata'), { motore: s2.motoreLettura, variante: s2.info && s2.info.variante });
  await comando('stop');
  const t0 = Date.now();
  let pronta = false;
  while (Date.now() - t0 < 300000 && !pronta) {
    await dorme(3000);
    pronta = await sw.evaluate(async () => {
      const db = await new Promise((ok) => {
        const q = indexedDB.open('webg-voice');
        q.onsuccess = () => ok(q.result);
        q.onerror = () => ok(null);
      });
      if (!db) return false;
      return new Promise((ok) => {
        const r = db.transaction('file').objectStore('file').count('v1/modelloU8');
        r.onsuccess = () => ok(r.result > 0);
        r.onerror = () => ok(false);
      });
    });
  }
  ok('carico: la Bilanciata si scarica in sottofondo', pronta, { secondi: Math.round((Date.now() - t0) / 1000) });
  await avviaLettura(1.0);
  const s3 = await attendi((s) => (s.fase === 'lettura' && s.info) || s.errore, 120000);
  ok('carico: dalla lettura dopo la Bilanciata', s3.motoreLettura === 'bilanciata' && s3.info.variante === 'bilanciata', { motore: s3.motoreLettura, variante: s3.info && s3.info.variante });
  await comando('stop');

  // 3. veloce: qualita' massima (e il modello torna quello fp32)
  await avviaLettura(0.7);
  const s4 = await attendi((s) => (s.fase === 'lettura' && s.info) || s.errore, 120000);
  ok('veloce: qualita massima', s4.motoreLettura === 'massima' && s4.info.variante === 'massima', { motore: s4.motoreLettura, variante: s4.info && s4.info.variante });
  await comando('stop');
} finally {
  await b.close();
}
console.log(ko ? `${ko} KO` : 'tutto OK');
process.exit(ko ? 1 : 0);
