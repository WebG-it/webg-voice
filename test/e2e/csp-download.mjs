// Download veri con la CSP della build di PRODUZIONE (connect-src limitato agli host dei modelli),
// SOLO HEADLESS, profilo nuovo. Scarica da internet tutti e tre i modelli (voce della lettura,
// dettatura Leggero, trascrizione delle call), registra gli host davvero contattati (redirect
// compresi), controlla che nessuna richiesta sia bloccata dalla CSP e che la voce legga.
//   npm run build        (estensione/)   oppure EXT=<build di produzione>
//   CHROME=<chrome for testing> PROFILO=<profilo nuovo> node test/e2e/csp-download.mjs
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ko = 0;
const ok = (n, c, d) => {
  if (!c) ko++;
  log(c ? 'OK  ' : 'NO  ', n, d !== undefined ? JSON.stringify(d).slice(0, 400) : '');
};
const csp = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).content_security_policy.extension_pages;
ok('build di produzione: CSP con connect-src e senza host locali', /connect-src/.test(csp) && !/127\.0\.0\.1|localhost/.test(csp), csp);

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 1800000,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'],
});
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
const host = new Set();
const bloccate = [];
const sessioni = new Set();
// rete e console di ogni documento e worker dell'estensione (offscreen e i suoi worker)
async function osserva(t) {
  if (!/^chrome-extension:/.test(t.url()) || t.type() === 'service_worker' || sessioni.has(t)) return;
  sessioni.add(t);
  try {
    const s = await t.createCDPSession();
    await s.send('Network.enable').catch(() => {});
    await s.send('Log.enable').catch(() => {});
    await s.send('Runtime.enable').catch(() => {});
    s.on('Network.requestWillBeSent', (e) => {
      try {
        const u = new URL(e.request.url);
        if (/^https?:$/.test(u.protocol)) host.add(u.host);
      } catch {}
    });
    s.on('Network.loadingFailed', (e) => {
      if (e.blockedReason === 'csp' || /csp|Content Security/i.test(e.errorText || '')) bloccate.push(e.errorText || e.blockedReason);
    });
    const testo = (x) => (x || '').toString();
    s.on('Log.entryAdded', (e) => /Content Security Policy|Refused to connect/i.test(testo(e.entry.text)) && bloccate.push(e.entry.text));
    s.on('Runtime.consoleAPICalled', (e) => {
      const t2 = e.args.map((a) => a.value || a.description || '').join(' ');
      if (/Content Security Policy|Refused to connect/i.test(t2)) bloccate.push(t2);
    });
    s.on('Runtime.exceptionThrown', (e) => {
      const t2 = testo(e.exceptionDetails && (e.exceptionDetails.exception && e.exceptionDetails.exception.description));
      if (/Content Security Policy|Refused to connect/i.test(t2)) bloccate.push(t2);
    });
    await s.send('Runtime.runIfWaitingForDebugger').catch(() => {});
  } catch {}
}
b.on('targetcreated', osserva);
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  await dorme(2000);
  const sw = await (b.targets().find((t) => t.type() === 'service_worker') || swT).worker();
  await sw.evaluate(() => chrome.storage.local.set({ motoreLettura: 'massima' }));
  for (const t of b.targets()) await osserva(t);
  const off = (m) => sw.evaluate((m) => chrome.runtime.sendMessage({ ...m, a: 'offscreen' }).catch((e) => ({ errore: String(e) })), m);
  // l'offscreen nasce con il download automatico dell'installazione
  const stato = async () => {
    const r = await off({ tipo: 'stato' });
    return r && r.stato;
  };

  // 1. voce della lettura (download automatico all'installazione) e lettura
  let t0 = Date.now();
  let s;
  for (;;) {
    s = await stato().catch(() => null);
    const d = s && s.download;
    if (d && d.interrotto) break;
    if (s && (s.motorePronto || (d && d.totale && d.scaricati >= d.totale))) break;
    if (Date.now() - t0 > 900000) break;
    await dorme(1000);
  }
  ok('voce: scaricata', s && s.download && s.download.scaricati >= s.download.totale && !s.download.interrotto, s && s.download);
  await dorme(3000);
  await off({ tipo: 'leggi', testo: 'Prova della voce con la nuova regola di sicurezza.', velocita: 1, tabId: null, t0: Date.now(), dizionario: [], voce: 'sara', motoreLettura: 'massima', rtfRecente: true });
  t0 = Date.now();
  for (;;) {
    s = await stato();
    if (s.fase === 'lettura' || s.errore || Date.now() - t0 > 120000) break;
    await dorme(300);
  }
  ok('voce: legge', s.fase === 'lettura' && !s.errore, { fase: s.fase, errore: s.errore });
  await off({ tipo: 'stop' });

  // 2. dettatura, modello Leggero (release GitHub dettatura-v1, riserva Hugging Face)
  const rd = await off({ tipo: 'dettScarica', modello: 'leggero' });
  const pd = await off({ tipo: 'dettPronto', modello: 'leggero' });
  ok('dettatura: modello Leggero scaricato e caricato', rd && rd.ok && pd && pd.completo, { rd: rd && (rd.errore || rd.ok), pd });

  // 3. trascrizione delle call: Parakeet (solo Hugging Face), scaricato e caricato
  const rc = await off({ tipo: 'chiamPrepara' });
  const pc = await off({ tipo: 'chiamPronto' });
  ok('call: Parakeet scaricato e caricato', rc && rc.ok, { rc, pc });

  const elenco = [...host].sort();
  log('host contattati:', elenco.join(', '));
  const ammessi = [/^github\.com$/, /^release-assets\.githubusercontent\.com$/, /^huggingface\.co$/, /\.hf\.co$/];
  ok('host: tutti dentro connect-src', elenco.every((h) => ammessi.some((r) => r.test(h))), elenco);
  ok('CSP: nessuna richiesta bloccata', !bloccate.length, bloccate.slice(0, 5));
} finally {
  await b.close();
}
log(ko ? `${ko} KO` : 'tutto OK');
process.exit(ko ? 1 : 0);
