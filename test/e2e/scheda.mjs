// Cambio di scheda durante la lettura (build di test), SOLO HEADLESS: la lettura deve continuare
// mentre la scheda e' nascosta (stato in lettura, tempo dell'audio che avanza) e, al ritorno,
// l'evidenziazione deve stare sulla frase che si sente. Vale anche per build senza evidenziazione
// (1.2.x): allora conta solo l'audio.
// Uso: CHROME=... PROFILO=<profilo con la voce> [EXT=...] [NASCOSTA_S=20] [CONGELA=1] [SOSPENDI=1] node test/e2e/scheda.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const NASCOSTA_S = Number(process.env.NASCOSTA_S || 20);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const R = { errori: [], esiti: {}, campioni: [] };
const ok = (nome, cond, dettaglio) => {
  R.esiti[nome] = { ok: !!cond, ...(dettaglio !== undefined ? { dettaglio } : {}) };
  log(cond ? 'OK  ' : 'NO  ', nome, dettaglio !== undefined ? JSON.stringify(dettaglio).slice(0, 300) : '');
};
const norma = (t) => (String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || []);

const base = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8').split('\n').filter((r) => r.trim());
const paragrafi = [...base, ...base];
const PAGINA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prova scheda</title>
<style>body{font:18px/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 16px} p{margin:0 0 18px}</style></head><body>
<h1>Un orto sul balcone</h1>
${paragrafi.map((p, i) => `<p id="p${i}">${p}</p>`).join('\n')}
</body></html>`;
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(q.url.startsWith('/altra') ? '<!doctype html><title>Altra</title><p>Un\'altra scheda, per fare altro.</p>' : PAGINA);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_P = `http://127.0.0.1:${server.address().port}/`;

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 600000,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const pid = b.process().pid;
if (!/--headless(=new)?\b/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
log('istanza headless PID', pid);
try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(extId);
  const aOff = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }).catch(() => null), tipo, extra);
  const stato = async () => {
    for (let i = 0; i < 30; i++) {
      const r = await aOff('stato');
      if (r && r.stato) return r.stato;
      await dorme(100);
    }
    return null;
  };
  const attendi = async (c, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (s && c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify(s).slice(0, 300));
      await dorme(150);
    }
  };
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'prova' });
  });
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto, 600000);
  const off = await (await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'))).asPage();
  await off.waitForFunction(() => globalThis.__test, { polling: 100 });
  const frase = () => off.evaluate(() => (globalThis.__test.fraseCorrente ? globalThis.__test.fraseCorrente() : { tempo: globalThis.__test.contesto().tempo, testo: undefined }));

  const page = await b.newPage();
  page.on('pageerror', (e) => R.errori.push(`[pagina] ${e.message}`));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL_P);
  await page.bringToFront();
  await page.triggerExtensionAction(ext);
  const popT = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
  await (await popT.asPage()).close();
  await dorme(300);
  const evidenziato = () =>
    page.evaluate(() => {
      const h = CSS.highlights && CSS.highlights.get('webg-voice-lettura');
      if (!h) return null;
      const r = [...h][0];
      if (!r) return null;
      const box = r.getBoundingClientRect();
      return { testo: r.toString(), visibile: box.height > 0 && box.top >= 0 && box.bottom <= innerHeight };
    });
  const allineata = async () => {
    const e = await evidenziato();
    const f = await frase();
    if (f.testo === undefined) return { senzaEvidenziazione: true };
    // la frase letta e' normalizzata (Dott. -> dottor, 18% -> diciotto per cento): basta che
    // almeno 6 delle sue prime 8 parole stiano nel testo evidenziato
    const attese = norma(f.testo).slice(0, 8);
    const ev = new Set(e ? norma(e.testo) : []);
    const prese = attese.filter((w) => ev.has(w)).length;
    return { ok: !!e && prese >= Math.min(6, attese.length), visibile: !!e && e.visibile, evidenziata: e && e.testo.slice(0, 70), frase: (f.testo || '').slice(0, 70) };
  };

  await sw.evaluate(() => __testMenuArticolo());
  await attendi((s) => s.fase === 'lettura', 60000);
  await dorme(5000);
  let prima = await allineata();
  for (let i = 0; i < 4 && !prima.senzaEvidenziazione && !prima.ok; i++) {
    await dorme(300);
    prima = await allineata();
  }
  ok('prima del cambio: evidenziazione sulla frase che si sente', prima.senzaEvidenziazione || prima.ok, prima);

  // cambio di scheda
  const altra = await b.newPage();
  await altra.goto(`${URL_P}altra`);
  await altra.bringToFront();
  await dorme(300);
  const visibilita = await page.evaluate(() => document.visibilityState);
  ok('la scheda della lettura e\' nascosta', visibilita === 'hidden', visibilita);
  const t0 = (await frase()).tempo;
  const evPrima = await evidenziato();
  // CONGELA=1: la scheda nascosta si congela come fa Chrome con le schede in secondo piano
  const cdp = process.env.CONGELA ? await page.createCDPSession() : null;
  if (cdp) await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  // SOSPENDI=1: il browser sospende l'audio dell'offscreen mentre la scheda e' nascosta
  if (process.env.SOSPENDI) await off.evaluate(() => globalThis.__test.sospendiAudio());
  const fasi = new Set();
  const cambiNascosta = new Set();
  for (let i = 0; i < NASCOSTA_S; i++) {
    await dorme(1000);
    const s = await stato();
    const f = await frase();
    const e = cdp ? null : await evidenziato();
    fasi.add(s.fase);
    if (e) cambiNascosta.add(e.testo.slice(0, 40));
    R.campioni.push({ s: i + 1, fase: s.fase, blocco: s.blocco, tempo: +f.tempo.toFixed(2), evidenziata: e && e.testo.slice(0, 40) });
  }
  const t1 = (await frase()).tempo;
  const avanzato = t1 - t0;
  ok('scheda nascosta: la lettura continua (mai in pausa)', [...fasi].every((f) => f === 'lettura' || f === 'preparazione'), [...fasi]);
  ok('scheda nascosta: il tempo dell\'audio avanza', avanzato >= NASCOSTA_S * 0.85, { secondi: +avanzato.toFixed(1), attesi: NASCOSTA_S });
  if (evPrima && !cdp) ok('scheda nascosta: l\'evidenziazione resta ferma', cambiNascosta.size <= 1, [...cambiNascosta]);

  // ritorno
  if (cdp) await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await page.bringToFront();
  await dorme(1500);
  // la frase puo' cambiare proprio mentre si guarda: fino a 5 tentativi in poco piu' di un secondo
  let dopo = await allineata();
  for (let i = 0; i < 4 && !dopo.senzaEvidenziazione && !(dopo.ok && dopo.visibile); i++) {
    await dorme(300);
    dopo = await allineata();
  }
  ok('al ritorno: evidenziazione sulla frase che si sente, in vista', dopo.senzaEvidenziazione || (dopo.ok && dopo.visibile), dopo);
  await dorme(4000);
  const dopo2 = await allineata();
  ok('al ritorno: l\'evidenziazione segue la lettura', dopo2.senzaEvidenziazione || dopo2.ok, dopo2);
  await page.screenshot({ path: join(OUT, 'scheda-ritorno.png') });
  await aOff('stop');
  await dorme(500);
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.errore = String(e.stack || e);
} finally {
  const tutti = Object.values(R.esiti);
  log(`fine: ${tutti.filter((x) => x.ok).length} su ${tutti.length} riusciti, errori ${R.errori.length}`);
  writeFileSync(join(OUT, `${process.env.NOME || 'scheda'}.json`), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
  server.close();
}
