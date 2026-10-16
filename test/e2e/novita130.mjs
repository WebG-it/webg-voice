// Prove della 1.3.0 nel browser (build di test), SOLO HEADLESS: evidenziazione della frase in
// lettura, "Rileggi la bozza", partenza a freddo con la scorciatoia.
// Uso: CHROME=<Chrome for Testing> PROFILO=<profilo con la voce> USCITE=<cartella> node test/e2e/novita130.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
mkdirSync(OUT, { recursive: true });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const R = { errori: [], esiti: {} };
const ok = (nome, cond, dettaglio) => {
  R.esiti[nome] = { ok: !!cond, ...(dettaglio !== undefined ? { dettaglio } : {}) };
  log(cond ? 'OK  ' : 'NO  ', nome, dettaglio !== undefined ? JSON.stringify(dettaglio).slice(0, 260) : '');
};

const base = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8').split('\n').filter((r) => r.trim());
const paragrafi = [...base, ...base, ...base];
const LONTANO = `#p${paragrafi.length - 2}`;
const BOZZA = 'Il progetto del sito è partito a gennaio con molto entusiasmo. Il progetto ha coinvolto molte persone, e le persone hanno lavorato bene. Alla fine il risultato è stato buono, e i risultati si vedono ancora oggi.';
const PAGINA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prova lunga</title>
<style>body{font:18px/1.6 Georgia,serif;max-width:720px;margin:40px auto;padding:0 16px} p{margin:0 0 18px}</style></head><body>
<h1>Un orto sul balcone</h1>
${paragrafi.map((p, i) => `<p id="p${i}">${p}</p>`).join('\n')}
<p id="bozza">${BOZZA}</p>
<textarea id="area" rows="5" cols="70">${BOZZA}</textarea>
<iframe id="riquadro" style="width:700px;height:160px" srcdoc="<!doctype html><html><body contenteditable='true'><p>${BOZZA}</p></body></html>"></iframe>
</body></html>`;
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGINA);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_P = `http://127.0.0.1:${server.address().port}/`;

const b = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 900000,
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
  const crea = () =>
    sw.evaluate(async () => {
      if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'prova' });
    });
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
  await crea();
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto, 600000);

  const page = await b.newPage();
  page.on('pageerror', (e) => R.errori.push(`[pagina] ${e.message}`));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL_P);
  async function apriPopup() {
    for (const t of b.targets()) if (t.url().endsWith('/popup.html')) await (await t.asPage()).close().catch(() => {});
    await dorme(200);
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const t = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    const p = await t.asPage();
    p.on('pageerror', (e) => R.errori.push(`[popup] ${e.message}`));
    await p.waitForSelector('#play');
    await dorme(300);
    return p;
  }
  // come col mouse: il fuoco lascia aree di testo e campi, poi si seleziona
  const seleziona = (q) => page.evaluate((q) => { if (document.activeElement) document.activeElement.blur(); const r = document.createRange(); r.selectNodeContents(document.querySelector(q)); getSelection().removeAllRanges(); getSelection().addRange(r); }, q);
  // testo evidenziato nella pagina, letto dal mondo della pagina (stesso registro del documento)
  const evidenziato = (nome = 'webg-voice-lettura') =>
    page.evaluate((nome) => {
      const h = CSS.highlights.get(nome);
      return h ? [...h].map((r) => r.toString()) : null;
    }, nome);
  const ferma = async () => {
    await aOff('stop');
    await dorme(600);
  };

  // ---- C1. articolo intero: la frase evidenziata segue la lettura ----
  await page.evaluate(() => window.scrollTo(0, 0));
  let pop = await apriPopup();
  await pop.close();
  await sw.evaluate(() => __testMenuArticolo());
  await attendi((s) => s.fase === 'lettura');
  const viste = [];
  for (let i = 0; i < 60 && viste.length < 4; i++) {
    const e = await evidenziato();
    if (e && e[0] && viste[viste.length - 1] !== e[0]) viste.push(e[0]);
    await dorme(300);
  }
  const contaFogli = () => page.evaluate(() => document.adoptedStyleSheets.filter((f) => [...f.cssRules].some((r) => r.cssText.includes('webg-voice'))).length);
  const fogliDurante = await contaFogli();
  const testoPagina = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok('evidenzia: l\'articolo evidenzia frasi che cambiano e stanno nella pagina', viste.length >= 2 && viste.every((v) => testoPagina.includes(v.replace(/\s+/g, ' ').slice(0, 40))), viste.map((v) => v.slice(0, 60)));
  await page.screenshot({ path: join(OUT, 'evidenzia-articolo.png') });
  await ferma();
  await dorme(800);
  ok('evidenzia: a fine lettura l\'evidenziazione si toglie', !((await evidenziato()) || []).length);
  const fogli = await contaFogli();
  ok('evidenzia: il foglio di stile c\'e\' durante la lettura e si toglie alla fine', fogliDurante === 1 && fogli === 0, { fogliDurante, fogli });

  // ---- C1b. pagine vere (facoltativo): PAGINE_VERE=url1,url2 ----
  for (const url of (process.env.PAGINE_VERE || '').split(',').filter(Boolean)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await dorme(2500);
      let pv = await apriPopup();
      await pv.close();
      const art = await sw.evaluate(() => __testArticolo());
      const norma = (t) => (t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || []).join(' ');
      const testoArt = norma(art.testo || '');
      pv = await apriPopup();
      await pv.close();
      await sw.evaluate(() => __testMenuArticolo());
      await attendi((s) => s.fase === 'lettura', 60000);
      const vere = [];
      for (let i = 0; i < 140 && vere.length < 4; i++) {
        const e = await evidenziato();
        if (e && e[0] && vere[vere.length - 1] !== e[0]) vere.push(e[0]);
        await dorme(300);
      }
      // ogni frase evidenziata sta nell'articolo, e le frasi vanno avanti nell'ordine dell'articolo
      const posizioni = vere.map((v) => testoArt.indexOf(norma(v).split(' ').slice(0, 6).join(' ')));
      const inOrdine = posizioni.every((x, i) => x >= 0 && (i === 0 || x >= posizioni[i - 1]));
      ok(`evidenzia: pagina vera ${new URL(url).host}`, vere.length >= 3 && inOrdine, { frasi: vere.map((v) => v.slice(0, 50)), posizioni });
      await page.screenshot({ path: join(OUT, `evidenzia-${new URL(url).host}.png`) });
      await ferma();
    } catch (e) {
      ok(`evidenzia: pagina vera ${url}`, false, String(e.message || e));
    }
  }
  if (process.env.PAGINE_VERE) {
    await page.goto(URL_P);
    await dorme(500);
  }

  // ---- C2. selezione lontana: la pagina scorre per tenerla in vista ----
  await page.evaluate(() => window.scrollTo(0, 0));
  await seleziona(LONTANO);
  pop = await apriPopup();
  await pop.close();
  await sw.evaluate(() => __testScorciatoia());
  await attendi((s) => s.fase === 'lettura');
  let e2 = null;
  for (let i = 0; i < 40 && !e2; i++) {
    const e = await evidenziato();
    if (e && e[0]) e2 = e[0];
    await dorme(250);
  }
  await dorme(1500);
  R.diagScorrimento = await page.evaluate(() => ({ prova: document.documentElement.dataset.webgProva, chiamate: document.documentElement.dataset.webgChiamate, nascosta: document.hidden, visibilita: document.visibilityState, focus: document.hasFocus(), alto: document.documentElement.scrollHeight, vista: innerHeight }));
  const sy = await page.evaluate(() => window.scrollY);
  const dentro = await page.evaluate((t, q) => document.querySelector(q).textContent.includes(t.trim().slice(0, 30)), e2 || '', LONTANO);
  ok('evidenzia: la selezione lontana viene evidenziata e portata in vista', !!e2 && dentro && sy > 500, { scrollY: sy, frase: (e2 || '').slice(0, 60), diag: R.diagScorrimento });
  // l'utente scorre a mano: per qualche secondo la pagina non viene riportata alla frase
  await page.mouse.move(400, 400);
  await page.mouse.wheel({ deltaY: -3000 });
  await dorme(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await dorme(2500);
  const sy2 = await page.evaluate(() => window.scrollY);
  ok('evidenzia: dopo la rotella dell\'utente non riporta subito la pagina', sy2 < 100, { scrollY: sy2 });
  await ferma();

  // ---- C3. opzione spenta ----
  await sw.evaluate(() => chrome.storage.local.set({ evidenzia: false }));
  await seleziona('#p2');
  pop = await apriPopup();
  await pop.close();
  await sw.evaluate(() => __testScorciatoia());
  await attendi((s) => s.fase === 'lettura');
  let acceso = false;
  for (let i = 0; i < 20; i++) {
    if (((await evidenziato()) || []).length) acceso = true;
    await dorme(300);
  }
  ok('evidenzia: con l\'opzione spenta non evidenzia', !acceso);
  await ferma();
  await sw.evaluate(() => chrome.storage.local.set({ evidenzia: true }));

  // ---- C4. textarea: si legge, niente evidenziazione, nessun errore ----
  await page.evaluate(() => { const a = document.querySelector('#area'); a.scrollIntoView(); a.focus(); a.setSelectionRange(0, a.value.length); });
  pop = await apriPopup();
  await pop.close();
  await page.evaluate(() => { const a = document.querySelector('#area'); a.focus(); a.setSelectionRange(0, a.value.length); });
  const errPrima = R.errori.length;
  await sw.evaluate(() => __testScorciatoia());
  const s4 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
  await dorme(2500);
  const ev4 = (await evidenziato()) || [];
  R.diag4 = await page.evaluate(() => ({ prova: document.documentElement.dataset.webgProva, chiamate: document.documentElement.dataset.webgChiamate, fuoco: document.activeElement.tagName }));
  log('diag area', JSON.stringify(R.diag4));
  ok('evidenzia: nell\'area di testo legge senza errori e senza evidenziare', s4.fase === 'lettura' && !ev4.length && R.errori.length === errPrima, { fase: s4.fase, errore: s4.errore, evidenziato: ev4, errori: R.errori.slice(errPrima) });
  await ferma();

  // ---- D1. Rileggi la bozza su una selezione della pagina ----
  await seleziona('#bozza');
  await sw.evaluate(() => chrome.storage.local.set({ velocita: 1 }));
  pop = await apriPopup();
  await pop.$eval('#testo', (e) => { e.value = ''; });
  await pop.click('#rileggi');
  await pop.waitForFunction(() => !document.querySelector('#bozzaBox').hidden && document.querySelector('#bozzaTesto').textContent.startsWith('Rileggo'), { timeout: 30000 });
  const lista = await pop.$$eval('#bozzaLista li', (l) => l.map((x) => x.textContent));
  const s5 = await attendi((s) => s.fase === 'lettura', 60000);
  await dorme(1200);
  const rip = await evidenziato('webg-voice-ripetizioni');
  await pop.screenshot({ path: join(OUT, 'bozza-pannello.png') });
  await page.screenshot({ path: join(OUT, 'bozza-pagina.png') });
  ok('bozza: elenco delle ripetizioni nel pannello', lista.some((x) => x.startsWith('progetto')) && lista.some((x) => x.startsWith('persone')), lista);
  ok('bozza: ripetizioni colorate nella pagina', rip && rip.length >= 4 && rip.every((x) => /progetto|persone|risultat/i.test(x)), rip);
  ok('bozza: legge piu\' lenta', Math.abs(s5.velocita - 0.85) < 0.001, s5.velocita);
  const fin = await attendi((s) => s.fase === 'inattivo', 120000);
  const fon = fin.metriche.fonemi || [];
  ok('bozza: una frase per blocco', fon.length >= 3, fon);
  await pop.close();

  // ---- D2. bozza in un'area di testo, in un riquadro modificabile e incollata nel pannello ----
  await page.evaluate(() => { const a = document.querySelector('#area'); a.scrollIntoView(); a.focus(); a.setSelectionRange(0, a.value.length); });
  pop = await apriPopup();
  await page.evaluate(() => { const a = document.querySelector('#area'); a.focus(); a.setSelectionRange(0, a.value.length); });
  await pop.click('#rileggi');
  await pop.waitForFunction(() => document.querySelector('#bozzaTesto').textContent.startsWith('Rileggo'), { timeout: 30000 }).catch(() => {});
  const la = await pop.$$eval('#bozzaLista li', (l) => l.length);
  const sa = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
  await dorme(1000);
  const ripArea = (await evidenziato('webg-voice-ripetizioni')) || [];
  ok('bozza: funziona nell\'area di testo', sa.fase === 'lettura' && la >= 2, { voci: la });
  ok('bozza: dall\'area di testo non colora parole altrove nella pagina', !ripArea.length, ripArea);
  await ferma();
  await pop.close();
  const fr = page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:srcdoc');
  await page.evaluate(() => document.querySelector('#riquadro').scrollIntoView());
  await fr.evaluate(() => { document.body.focus(); const r = document.createRange(); r.selectNodeContents(document.body); getSelection().removeAllRanges(); getSelection().addRange(r); });
  pop = await apriPopup();
  await fr.evaluate(() => { document.body.focus(); const r = document.createRange(); r.selectNodeContents(document.body); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await pop.click('#rileggi');
  await pop.waitForFunction(() => document.querySelector('#bozzaTesto').textContent.startsWith('Rileggo'), { timeout: 30000 }).catch(() => {});
  const lr = await pop.$$eval('#bozzaLista li', (l) => l.length);
  const sr = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
  ok('bozza: funziona nel riquadro modificabile (come TinyMCE)', sr.fase === 'lettura' && lr >= 2, { voci: lr });
  await ferma();
  await pop.close();
  pop = await apriPopup();
  await pop.$eval('#testo', (e, t) => { e.value = t; e.closest('details').open = true; }, BOZZA);
  await pop.click('#rileggi');
  await pop.waitForFunction(() => document.querySelector('#bozzaTesto').textContent.startsWith('Rileggo'), { timeout: 30000 }).catch(() => {});
  const lp = await pop.$$eval('#bozzaLista li', (l) => l.length);
  const sp = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
  ok('bozza: funziona col testo incollato nel pannello', sp.fase === 'lettura' && lp >= 2, { voci: lp });
  await ferma();
  await pop.$eval('#testo', (e) => { e.value = ''; });
  await pop.evaluate(() => chrome.storage.local.set({ bozza: '' }));
  await pop.close();

  // ---- A. partenza a freddo con la scorciatoia (motore scaricato) ----
  const freddi = [];
  for (let k = 0; k < 2; k++) {
    await sw.evaluate(async () => { if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument(); });
    await dorme(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await seleziona('#p0');
    pop = await apriPopup();
    // il pannello aperto precarica il motore: lo chiudo e libero di nuovo, per misurare la scorciatoia da sola
    await pop.close();
    await dorme(300);
    await sw.evaluate(async () => { if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument(); });
    await dorme(1500);
    const t0 = Date.now();
    await sw.evaluate(() => __testScorciatoia());
    const sf = await attendi((s) => s.fase === 'lettura', 60000);
    freddi.push({ primoSuonoMs: sf.metriche.primoSuonoMs, daScorciatoiaMs: Date.now() - t0 });
    await ferma();
  }
  ok('freddo: scorciatoia con motore scaricato', freddi.every((f) => f.primoSuonoMs > 0), freddi);
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.erroreTest = String(e.stack || e);
} finally {
  writeFileSync(join(OUT, 'risultati-novita130.json'), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
  server.close();
  const esiti = Object.values(R.esiti);
  log(`fine: ${esiti.filter((x) => x.ok).length} su ${esiti.length} riusciti, errori ${R.errori.length}`);
}
