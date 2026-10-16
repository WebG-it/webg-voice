// Prove delle funzioni della 1.2: articolo intero, MP3, voce Nicola. SOLO HEADLESS.
// Uso (profilo con la voce gia' scaricata, vedi test/README.md):
//   CHROME=<Chrome for Testing> PROFILO=<profilo> USCITE=<cartella> node test/e2e/funzioni.mjs
// FASI=estrazione,nessuno,menu,nicola,mp3,annulla,concorrenza,lungo (predefinito: tutte)
// PAGINE=url1,url2,...  pagine vere su cui provare l'estrazione (predefinite sotto)
// LUNGO=<url> articolo lungo da leggere tutto (predefinito: la voce di Wikipedia)
// Per controllare l'MP3 servono ffprobe e ffmpeg nel PATH (o FFMPEG_DIR).
import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const OUT = process.env.USCITE || join(QUI, 'uscite');
const DL = join(OUT, 'download');
mkdirSync(DL, { recursive: true });
const FASI = new Set((process.env.FASI || 'estrazione,nessuno,menu,nicola,mp3,annulla,concorrenza,lungo').split(','));
const PAGINE = (
  process.env.PAGINE ||
  [
    'https://www.webg.it/blog/244-realizzazione-siti-vetrina-la-guida-completa.html',
    'https://www.scossaditerremoto.it/lista-terremoti/lista-usgs/24499-terremoto-magnitudo-6-7-dorsale-medio-atlantica.html',
    'https://it.wikipedia.org/wiki/Terremoto_dell%27Irpinia_del_1980',
    'https://www.ilpost.it/2026/10/13/ex-ilva-decreto-legge-cassa-integrazione-lavoratori/',
    'https://www.corriere.it/cronache/26_ottobre_13/riforma-codice-della-strada-oggi-il-governo-da-il-primo-ok-dalle-multe-alla-patente-tutti-i-nodi-della-riforma-c55e8d12-3b9a-43b7-88ac-96cd5d13cxlk.shtml',
    'https://www.ansa.it/sito/notizie/cronaca/2026/10/13/sui-vestiti-di-liliana-resinovich-il-dna-di-un-uomo-sconosciuto_566d7511-267b-4379-bf25-45c4740b4829.html',
  ].join(',')
).split(',');
const LUNGO = process.env.LUNGO || 'https://it.wikipedia.org/wiki/Terremoto_dell%27Irpinia_del_1980';
const FF = process.env.FFMPEG_DIR ? (n) => join(process.env.FFMPEG_DIR, n) : (n) => n;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const R = { errori: [], esiti: {} };
const ok = (nome, cond, dettaglio) => {
  R.esiti[nome] = { ok: !!cond, ...(dettaglio !== undefined ? { dettaglio } : {}) };
  log(cond ? 'OK  ' : 'NO  ', nome, dettaglio !== undefined ? JSON.stringify(dettaglio).slice(0, 300) : '');
};

// pagine locali: articolo di prova e pagina senza articolo
const ARTICOLO = readFileSync(join(QUI, 'articolo.html'), 'utf8');
// articolo con sottotitoli, elenco e citazione: i confini di paragrafo devono restare
const STRUTTURA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>La torta della nonna</title></head><body><main><article>
<h1>La torta della nonna</h1>
<p>Questa torta si prepara da generazioni nella nostra famiglia e ogni volta che la portiamo in tavola finisce in pochi minuti. Gli ingredienti sono semplici e si trovano in qualsiasi supermercato, ma il segreto sta nella pazienza e nella cottura lenta.</p>
<h2>Come si prepara</h2>
<ul><li>farina</li><li>uova fresche</li><li>latte intero</li></ul>
<p>Si mescolano gli ingredienti con calma, senza fretta, finché l'impasto non diventa liscio e lucido. Poi si versa nello stampo imburrato e si lascia riposare per una decina di minuti prima di infornare.</p>
<h2>Cosa dice la nonna</h2>
<blockquote>«Non ci sono problemi», ha detto.</blockquote>
<p>La cottura dura circa quaranta minuti in forno statico a centottanta gradi. Quando la superficie è dorata si spegne il forno e si lascia la torta dentro ancora qualche minuto, con lo sportello socchiuso.</p>
</article></main></body></html>`;
const VUOTA = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Accedi</title></head><body><nav><a href="/">Home</a> <a href="/chi">Chi siamo</a></nav><form><label>Email <input></label><button>Entra</button></form><footer>© 2026</footer></body></html>';
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(q.url.startsWith('/vuota') ? VUOTA : q.url.startsWith('/struttura') ? STRUTTURA : ARTICOLO);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const LOCALE = `http://127.0.0.1:${server.address().port}`;

const b = await puppeteer.launch({
  headless: true, // = --headless=new
  pipe: true,
  enableExtensions: [EXT],
  executablePath: process.env.CHROME,
  userDataDir: process.env.PROFILO,
  args: ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'],
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
  const cdp = await b.target().createCDPSession();
  const scaricati = [];
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  cdp.on('Browser.downloadWillBegin', (e) => scaricati.push({ nome: e.suggestedFilename, guid: e.guid, fine: false }));
  cdp.on('Browser.downloadProgress', (e) => {
    const d = scaricati.find((x) => x.guid === e.guid);
    if (d && e.state === 'completed') d.fine = true;
  });

  let offPagina = null;
  const offscreen = async () => {
    if (offPagina && !offPagina.isClosed()) return offPagina;
    await sw.evaluate(() => chrome.runtime.sendMessage({ a: 'offscreen', tipo: 'stato' }).catch(() => {}));
    const t = await b.waitForTarget((t) => t.url().endsWith('/offscreen.html'), { timeout: 30000 });
    const p = await t.asPage();
    p.on('console', (m) => ['error', 'warn'].includes(m.type()) && R.errori.push(`[off] ${m.text()}`));
    p.on('pageerror', (e) => R.errori.push(`[off] ${e.message}`));
    await p.waitForFunction(() => globalThis.__test, { timeout: 30000, polling: 200 });
    offPagina = p;
    return p;
  };
  // l'offscreen si crea alla prima richiesta: lo apro subito con una richiesta di stato
  await sw.evaluate(async () => {
    if (!(await chrome.offscreen.hasDocument()))
      await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'WORKERS'], justification: 'test' });
  });
  let off = await offscreen();
  const stato = async () => (await offscreen()).evaluate(() => __test.stato());
  const attendi = async (c, ms = 600000, passo = 250) => {
    const t0 = Date.now();
    for (;;) {
      const s = await stato();
      if (c(s)) return s;
      if (Date.now() - t0 > ms) throw new Error('timeout ' + JSON.stringify({ ...s, metriche: undefined }).slice(0, 600));
      await dorme(passo);
    }
  };
  const aOff = (tipo, extra = {}) => sw.evaluate((tipo, extra) => chrome.runtime.sendMessage({ a: 'offscreen', tipo, ...extra }), tipo, extra);
  const memoria = async () => {
    const s = await (await offscreen()).createCDPSession();
    await s.send('HeapProfiler.collectGarbage').catch(() => {});
    const h = await s.send('Runtime.getHeapUsage');
    await s.detach();
    return { heapMB: +(h.usedSize / 1048576).toFixed(1), arrayBufferMB: +((h.backingStorageSize || 0) / 1048576).toFixed(1) };
  };

  // avvio del motore (modello gia' nel profilo)
  await aOff('preparaMotore');
  await attendi((s) => s.motorePronto, 600000);

  const page = await b.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  async function vai(url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dorme(2500);
  }
  async function chiudiPopup() {
    for (const t of b.targets()) if (t.url().endsWith('/popup.html')) await (await t.asPage()).close().catch(() => {});
    await dorme(200);
  }
  // aprire il popup dall'azione dell'estensione concede activeTab sulla scheda, come per l'utente
  async function apriPopup() {
    await chiudiPopup();
    await page.bringToFront();
    await page.triggerExtensionAction(ext);
    const t = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    const p = await t.asPage();
    p.on('pageerror', (e) => R.errori.push(`[popup] ${e.message}`));
    await p.waitForSelector('#play');
    await dorme(400);
    return p;
  }
  const ferma = async () => {
    await aOff('stop');
    await dorme(500);
  };

  // ---- 1. estrazione dell'articolo su pagine vere ----
  if (FASI.has('estrazione')) {
    R.estrazione = [];
    for (const url of PAGINE) {
      try {
        await vai(url);
        const pop = await apriPopup();
        const a = await sw.evaluate(() => __testArticolo());
        await pop.close().catch(() => {});
        const testo = a.testo || '';
        const nome = new URL(url).host.replace(/^www\./, '');
        writeFileSync(join(OUT, `articolo-${nome}.txt`), testo);
        const r = {
          url,
          titolo: a.titolo,
          parole: a.parole || 0,
          msEstrazione: a.ms,
          msTotali: a.msTotali,
          nessuno: !!a.nessuno,
          inizio: testo.slice(0, 160),
          fine: testo.slice(-160),
          sospetti: (testo.match(/cookie|consenso|accetta(?:re)? tutt|newsletter|iscriviti|abbonati|pubblicit/gi) || []).length,
        };
        R.estrazione.push(r);
        ok(`estrazione ${nome}`, !a.nessuno && r.parole >= 100, { parole: r.parole, titolo: r.titolo, ms: r.msEstrazione, sospetti: r.sospetti });
      } catch (e) {
        R.estrazione.push({ url, errore: String(e.message || e) });
        ok(`estrazione ${url}`, false, String(e.message || e));
      }
    }
  }

  // ---- 1b. articolo strutturato: titoli, voci di elenco e citazioni restano paragrafi ----
  if (FASI.has('estrazione')) {
    await vai(`${LOCALE}/struttura`);
    const pop = await apriPopup();
    const a = await sw.evaluate(() => __testArticolo());
    await pop.close().catch(() => {});
    const t = a.testo || '';
    writeFileSync(join(OUT, 'articolo-struttura.txt'), t);
    const fuso = t.split(/\n\n/).some((p) => /prepara farina|farina uova|nonna «|problemi», ha detto\. La/.test(p));
    ok('articolo strutturato: confini di paragrafo', !a.nessuno && t.includes('\n\nfarina\n\n') && t.includes('\n\nCome si prepara\n\n') && !fuso, t.slice(0, 200));
  }

  // ---- 2. pagina senza articolo: "!" sull'icona e spiegazione nel popup ----
  if (FASI.has('nessuno')) {
    await vai(`${LOCALE}/vuota`);
    const pop = await apriPopup();
    await pop.close();
    const esito = await sw.evaluate(() => __testScorciatoia());
    await dorme(300);
    const [badge, avviso] = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return [await chrome.action.getBadgeText({ tabId: tab.id }), (await chrome.storage.session.get('avviso')).avviso];
    });
    ok('nessun articolo: badge "!"', esito === false && badge === '!' && avviso && avviso.motivo === 'articolo', { badge, avviso: avviso && avviso.titolo });
    const pop2 = await apriPopup();
    await dorme(300);
    const msg = await pop2.$eval('#avvisoPagina', (e) => (e.hidden ? '' : e.textContent));
    ok('nessun articolo: spiegazione nel popup', /Non trovo un articolo/.test(msg), msg);
    await pop2.screenshot({ path: join(OUT, 'popup-nessun-articolo.png') });
    // anche Leggi del popup (senza selezione cerca l'articolo) lo spiega
    await pop2.click('#play');
    await dorme(800);
    const msg2 = await pop2.$eval('#avvisoPagina', (e) => (e.hidden ? '' : e.textContent));
    ok('nessun articolo: pulsante del popup', /articolo/.test(msg2), msg2);
    await pop2.close();
  }

  // ---- 3. Alt+Q senza selezione e menu "Leggi tutto l'articolo" ----
  if (FASI.has('menu')) {
    await vai(PAGINE[0]);
    let pop = await apriPopup();
    await pop.close();
    await page.evaluate(() => getSelection().removeAllRanges());
    const t0 = Date.now();
    await sw.evaluate(() => __testScorciatoia());
    const s1 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
    ok('Alt+Q senza selezione legge l\'articolo', s1.fase === 'lettura' && !!s1.titolo, { titolo: s1.titolo, primoSuonoMs: s1.metriche.primoSuonoMs, ms: Date.now() - t0 });
    await page.screenshot({ path: join(OUT, 'articolo-in-lettura.png') });
    pop = await apriPopup();
    await pop.screenshot({ path: join(OUT, 'popup-articolo-in-lettura.png') });
    await pop.close();
    // di nuovo Alt+Q senza selezione: pausa, poi ripresa
    await sw.evaluate(() => __testScorciatoia());
    await dorme(600);
    const p1 = (await stato()).fase;
    await sw.evaluate(() => __testScorciatoia());
    await dorme(600);
    const p2 = (await stato()).fase;
    ok('Alt+Q durante l\'articolo: pausa e ripresa', p1 === 'pausa' && p2 === 'lettura', { p1, p2 });
    await ferma();
    // selezione presente: vince la selezione
    await page.evaluate(() => {
      const p = [...document.querySelectorAll('p')].find((x) => x.textContent.trim().length > 80);
      const r = document.createRange();
      r.selectNodeContents(p);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    pop = await apriPopup();
    await pop.close();
    await sw.evaluate(() => __testScorciatoia());
    const s3 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
    ok('con selezione si legge la selezione', s3.fase === 'lettura' && !s3.titolo, { totale: s3.totale });
    await ferma();
    await page.evaluate(() => getSelection().removeAllRanges());
    pop = await apriPopup();
    await pop.close();
    await sw.evaluate(() => __testMenuArticolo());
    const s4 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
    ok('menu "Leggi tutto l\'articolo"', s4.fase === 'lettura' && !!s4.titolo, { titolo: s4.titolo });
    await ferma();
    // pulsante del popup
    pop = await apriPopup();
    await pop.click('#play');
    const s5 = await attendi((s) => s.fase === 'lettura' || s.errore, 60000);
    ok('pulsante "Leggi l\'articolo" del popup', s5.fase === 'lettura' && !!s5.titolo, { titolo: s5.titolo });
    await pop.close();
    await ferma();
  }

  // ---- 4. voce Nicola: scelta nel popup, download della voce, lettura ----
  if (FASI.has('nicola')) {
    await vai(`${LOCALE}/articolo`);
    let pop = await apriPopup();
    const inCachePrima = await pop.evaluate(async () => (await import('./lib/modelli.js')).voceInCache('nicola'));
    const t0 = Date.now();
    await pop.click('.voci button[data-voce="nicola"]');
    let inCacheDopo = false;
    while (!inCacheDopo && Date.now() - t0 < 60000) {
      await dorme(100);
      inCacheDopo = await pop.evaluate(async () => (await import('./lib/modelli.js')).voceInCache('nicola'));
    }
    const msVoce = Date.now() - t0;
    const sv = await attendi((s) => s.voce === 'nicola' && !s.downloadVoce, 30000, 100);
    const salvata = await sw.evaluate(async () => (await chrome.storage.local.get('voce')).voce);
    ok('Nicola scaricata e ricordata', inCacheDopo && salvata === 'nicola' && !sv.errore, { inCachePrima, inCacheDopo, salvata, msVoce, errore: sv.errore });
    await pop.screenshot({ path: join(OUT, 'popup-nicola.png') });
    await pop.close();
    // stessa frase con le due voci
    const FRASE = 'Buongiorno, questa è una prova di lettura con la voce scelta nelle impostazioni.';
    const wavDi = async (v) => {
      await sw.evaluate((v) => chrome.storage.local.set({ voce: v }), v);
      await off.evaluate(() => __test.registra(true));
      await aOff('leggi', { testo: FRASE, voce: v, velocita: 1 });
      await attendi((s) => s.fase === 'lettura', 60000);
      const s = await attendi((s) => s.fase === 'inattivo', 60000);
      const w = await off.evaluate(() => __test.registrazioneWav());
      await off.evaluate(() => __test.registra(false));
      writeFileSync(join(OUT, `voce-${v}.wav`), Buffer.from(w.wav, 'base64'));
      return { secondi: +w.secondi.toFixed(2), voce: s.voce, byte: Buffer.from(w.wav, 'base64') };
    };
    const n = await wavDi('nicola');
    const sa = await wavDi('sara');
    ok('Nicola legge, ed e\' diversa da Sara', n.voce === 'nicola' && sa.voce === 'sara' && n.secondi > 2 && !n.byte.equals(sa.byte), { nicolaSec: n.secondi, saraSec: sa.secondi });
    // il popup riaperto mostra la scelta salvata
    await sw.evaluate(() => chrome.storage.local.set({ voce: 'nicola' }));
    pop = await apriPopup();
    const scelta = await pop.$eval('.voci button[aria-checked="true"]', (e) => e.dataset.voce);
    ok('il popup ricorda Nicola', scelta === 'nicola', scelta);
    // torno a Sara per il resto delle prove
    await pop.click('.voci button[data-voce="sara"]');
    await attendi((s) => s.voce === 'sara', 10000);
    await pop.close();
    // opzioni: sezione Voce con la scelta salvata
    const op = await b.newPage();
    await op.goto(`chrome-extension://${extId}/diagnostica.html`);
    await dorme(600);
    const radio = await op.$eval('input[name="voce"]:checked', (e) => e.value);
    ok('opzioni: scelta della voce', radio === 'sara', radio);
    await op.screenshot({ path: join(OUT, 'opzioni-voce.png'), fullPage: true });
    await op.close();
  }

  const ffprobe = (f) => {
    try {
      const j = JSON.parse(execFileSync(FF('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration,bit_rate,format_name:stream=codec_name,sample_rate,channels:format_tags=title,artist', '-of', 'json', f], { encoding: 'utf8' }));
      let decodifica = 'ok';
      try {
        const err = execFileSync(FF('ffmpeg'), ['-v', 'error', '-i', f, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        if (err.trim()) decodifica = err.trim().slice(0, 300);
      } catch (e) {
        decodifica = String(e.stderr || e.message).slice(0, 300);
      }
      return { durata: +(+j.format.duration).toFixed(2), formato: j.format.format_name, codec: j.streams[0].codec_name, hz: +j.streams[0].sample_rate, canali: j.streams[0].channels, kbps: Math.round(j.format.bit_rate / 1000), titolo: j.format.tags && j.format.tags.title, artista: j.format.tags && j.format.tags.artist, decodifica };
    } catch (e) {
      return { errore: String(e.message || e).slice(0, 300) };
    }
  };
  async function attendiFile(nome, ms = 60000) {
    const t0 = Date.now();
    for (;;) {
      const d = scaricati.find((x) => x.nome === nome && x.fine);
      if (d && existsSync(join(DL, nome))) return join(DL, nome);
      if (Date.now() - t0 > ms) throw new Error(`file ${nome} non scaricato (${JSON.stringify(scaricati)})`);
      await dorme(200);
    }
  }

  // ---- 5. MP3 dal popup: testo incollato e articolo intero ----
  if (FASI.has('mp3')) {
    for (const f of readdirSync(DL)) rmSync(join(DL, f));
    await vai(`${LOCALE}/articolo`);
    let pop = await apriPopup();
    const base = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8');
    await pop.$eval('#testo', (e, t) => { e.value = t; e.closest('details').open = true; }, base);
    const t0 = Date.now();
    await pop.click('#mp3');
    await attendi((s) => s.mp3 && s.mp3.fase === 'sintesi', 60000);
    await dorme(1500);
    await pop.screenshot({ path: join(OUT, 'popup-mp3-avanzamento.png') });
    const s = await attendi((s) => s.mp3 && (s.mp3.fase === 'pronto' || s.mp3.fase === 'errore'), 600000, 500);
    const ms = Date.now() - t0;
    const file = await attendiFile(s.mp3.nomeFile);
    await dorme(500);
    await pop.screenshot({ path: join(OUT, 'popup-mp3-pronto.png') });
    const p = ffprobe(file);
    const salvato = (await stato()).mp3.salvato;
    ok('MP3 testo incollato: file valido', s.mp3.fase === 'pronto' && p.codec === 'mp3' && p.decodifica === 'ok' && Math.abs(p.durata - s.mp3.secondi) < 1.5 && salvato, {
      nome: s.mp3.nomeFile, byte: statSync(file).size, secondiAudio: s.mp3.secondi, ms, rtf: +(ms / 1000 / s.mp3.secondi).toFixed(2), ffprobe: p, salvato,
    });
    await pop.$eval('#testo', (e) => { e.value = ''; });
    await pop.evaluate(() => chrome.storage.local.set({ bozza: '' }));
    await pop.close();
    // articolo intero di una pagina vera, senza testo nel popup
    await vai(PAGINE[0]);
    pop = await apriPopup();
    await pop.$eval('#testo', (e) => { e.value = ''; });
    const t1 = Date.now();
    await pop.click('#mp3');
    const s1 = await attendi((s) => s.mp3 && s.mp3.fase === 'sintesi', 60000);
    await pop.close(); // il popup si chiude: il lavoro continua, il badge mostra l'avanzamento
    await dorme(3000);
    const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
    const s2 = await attendi((s) => s.mp3 && (s.mp3.fase === 'pronto' || s.mp3.fase === 'errore'), 1800000, 1000);
    const ms1 = Date.now() - t1;
    const badgePronto = await sw.evaluate(() => chrome.action.getBadgeText({}));
    // riaprendo il popup il file si salva da solo
    pop = await apriPopup();
    const file1 = await attendiFile(s2.mp3.nomeFile, 30000);
    await pop.close();
    const p1 = ffprobe(file1);
    ok('MP3 articolo intero: file valido, nome dal titolo', s2.mp3.fase === 'pronto' && p1.decodifica === 'ok' && Math.abs(p1.durata - s2.mp3.secondi) < 2 && /sito vetrina/i.test(s2.mp3.nomeFile), {
      nome: s2.mp3.nomeFile, titolo: s1.mp3.titolo, blocchi: s2.mp3.totale, byte: statSync(file1).size, secondiAudio: s2.mp3.secondi, ms: ms1, rtf: +(ms1 / 1000 / s2.mp3.secondi).toFixed(2), badgeDurante: badge, badgePronto, ffprobe: p1,
    });
  }

  // ---- 6. annullare l'MP3 ----
  if (FASI.has('annulla')) {
    await vai(LUNGO);
    let pop = await apriPopup();
    await pop.$eval('#testo', (e) => { e.value = ''; });
    await pop.click('#mp3');
    await attendi((s) => s.mp3 && s.mp3.fase === 'sintesi' && s.mp3.fatti >= 3, 120000, 200);
    const prima = scaricati.length;
    await pop.click('#mp3Annulla');
    const s = await attendi((s) => !s.mp3, 15000, 100);
    await dorme(2000);
    const box = await pop.$eval('#mp3Box', (e) => e.hidden);
    await pop.close();
    // il motore e' libero: una lettura parte subito
    await aOff('leggi', { testo: 'Dopo l\'annullamento la lettura parte subito.', velocita: 1 });
    const s2 = await attendi((s) => s.fase === 'lettura' || s.errore, 30000);
    ok('MP3 annullato: niente file, motore libero', !s.mp3 && scaricati.length === prima && box && s2.fase === 'lettura', { primoSuonoMs: s2.metriche.primoSuonoMs, badge: await sw.evaluate(() => chrome.action.getBadgeText({})) });
    await attendi((s) => s.fase === 'inattivo', 60000);
  }

  // ---- 7. MP3 e lettura insieme: la lettura ha la precedenza ----
  if (FASI.has('concorrenza')) {
    const FRASE = 'Mentre si crea un file MP3, la lettura normale deve partire in pochi secondi e scorrere senza pause.';
    // stesso testo da solo, per confrontare primo suono e pause con e senza MP3
    await aOff('leggi', { testo: FRASE + ' ' + FRASE + ' ' + FRASE, velocita: 1 });
    const solo = await attendi((s) => s.fase === 'lettura', 30000);
    const soloMs = solo.metriche.primoSuonoMs;
    const soloFine = await attendi((s) => s.fase === 'inattivo', 120000);
    const buchiSolo = soloFine.metriche.buchi || 0;
    const lungo = readFileSync(join(QUI, '..', 'testo-lungo.txt'), 'utf8');
    await aOff('mp3', { testo: Array(4).fill(lungo).join('\n'), velocita: 1 });
    await attendi((s) => s.mp3 && s.mp3.fase === 'sintesi' && s.mp3.fatti >= 2, 120000, 200);
    await aOff('leggi', { testo: FRASE + ' ' + FRASE + ' ' + FRASE, velocita: 1 });
    const insieme = await attendi((s) => s.fase === 'lettura', 60000);
    const fatti0 = insieme.mp3 && insieme.mp3.fatti;
    const fineL = await attendi((s) => s.fase === 'inattivo', 120000);
    const sm = await attendi((s) => s.mp3 && s.mp3.fase === 'pronto', 900000, 500);
    ok('lettura durante l\'MP3: parte presto e senza pause in piu\'', insieme.metriche.primoSuonoMs < soloMs + 9000 && (fineL.metriche.buchi || 0) <= buchiSolo && sm.mp3.fase === 'pronto', {
      primoSuonoDaSolaMs: soloMs, primoSuonoConMp3Ms: insieme.metriche.primoSuonoMs, buchiDaSola: buchiSolo, buchiConMp3: fineL.metriche.buchi || 0, blocchiMp3AllAvvio: fatti0, mp3: sm.mp3.fase,
    });
    await aOff('chiudiMp3');
  }

  // ---- 8. articolo lungo letto tutto: memoria stabile, nessun blocco ----
  if (FASI.has('lungo')) {
    await vai(LUNGO);
    let pop = await apriPopup();
    await pop.close();
    const a = await sw.evaluate(() => __testArticolo());
    writeFileSync(join(OUT, 'articolo-lungo.txt'), a.testo || '');
    const vel = +(process.env.VELOCITA || 1.5);
    await sw.evaluate((v) => chrome.storage.local.set({ velocita: v }), vel);
    pop = await apriPopup();
    await pop.close();
    await page.evaluate(() => getSelection().removeAllRanges());
    const mem0 = await memoria();
    const t0 = Date.now();
    await sw.evaluate(() => __testScorciatoia());
    const s1 = await attendi((s) => s.fase === 'lettura' || s.errore, 120000);
    const campioni = [{ min: 0, ...mem0, blocco: 0, totale: s1.totale }];
    let ultimo = Date.now();
    let s;
    for (;;) {
      s = await stato();
      if (s.fase === 'inattivo' || s.errore) break;
      if (Date.now() - ultimo > 60000) {
        ultimo = Date.now();
        const m = await memoria();
        campioni.push({ min: +((Date.now() - t0) / 60000).toFixed(1), ...m, blocco: s.blocco, totale: s.totale, buchi: s.metriche.buchi || 0 });
        log('lungo', JSON.stringify(campioni[campioni.length - 1]));
      }
      if (Date.now() - t0 > 3 * 3600000) throw new Error('lettura lunga oltre 3 ore');
      await dorme(1000);
    }
    const memF = await memoria();
    campioni.push({ min: +((Date.now() - t0) / 60000).toFixed(1), ...memF, blocco: s.blocco, totale: s.totale, fine: true });
    const durataMin = +((Date.now() - t0) / 60000).toFixed(1);
    const crescita = Math.max(...campioni.map((c) => c.arrayBufferMB)) - campioni[1 < campioni.length ? 1 : 0].arrayBufferMB;
    ok('articolo lungo letto fino in fondo, memoria stabile', !s.errore && s.blocco === s.totale && crescita < 30, {
      parole: a.parole, titolo: a.titolo, velocita: vel, primoSuonoMs: s1.metriche.primoSuonoMs, preparazioneMs: s.metriche.preparazioneMs, sezioni: undefined,
      blocchi: s.totale, secondiAudio: s.metriche.secondiAudio, durataMin, buchi: s.metriche.buchi || 0, buchiSec: s.metriche.buchiSec || [], rtf: s.rtf, crescitaArrayBufferMB: +crescita.toFixed(1), campioni,
    });
    await sw.evaluate(() => chrome.storage.local.set({ velocita: 1 }));
  }
} catch (e) {
  console.error('ERRORE', e.stack || e);
  R.erroreTest = String(e.stack || e);
} finally {
  writeFileSync(join(OUT, 'risultati-funzioni.json'), JSON.stringify(R, null, 2));
  try {
    await b.close();
  } catch {}
  try {
    process.kill(pid);
  } catch {}
  server.close();
  const esiti = Object.values(R.esiti);
  log(`fine: ${esiti.filter((x) => x.ok).length} su ${esiti.length} riusciti, errori console ${R.errori.length}`);
}
