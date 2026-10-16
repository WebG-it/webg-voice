// Prova end-to-end della dettatura, SOLO Chrome for Testing headless, profilo temporaneo.
//   npm run build:test && npm i --no-save puppeteer
//   CHROME=<chrome for testing> node test/dettatura/e2e.mjs                  # inserimento nei campi
//   CHROME=<...> MODELLI=<cartella modelli> AUDIO=<wav 16 kHz> node test/dettatura/e2e.mjs   # anche microfono finto e Whisper
// Parte 1: pagine locali (input, textarea alla React, editor che gestisce beforeinput, contenteditable,
// riquadro, nessun campo): il testo "dettato" passa dal service worker alla pagina come nell'uso vero.
// Parte 2 (con MODELLI e AUDIO): microfono finto di Chrome che suona AUDIO, modello Whisper servito
// da un server locale (stessi byte e impronte dei file pubblicati), Ctrl+Spazio simulato, testo nel campo.
import puppeteer from 'puppeteer';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PAGINE } from './pagine.mjs';
import { FILE_DETTATURA } from '../../src/lib/modelli-dettatura.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const EXT = process.env.EXT || join(QUI, '..', '..', 'estensione-test');
const MODELLI = process.env.MODELLI;
const AUDIO = process.env.AUDIO;
const MODELLO = process.env.MODELLO || 'normale';
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const esiti = [];
const controlla = (nome, ok, dettaglio = '') => {
  esiti.push({ nome, ok, dettaglio });
  log(ok ? 'OK ' : 'KO ', nome, dettaglio ? `| ${dettaglio}` : '');
};

// file locali dei modelli, per chiave di FILE_DETTATURA
const LOCALI = {
  dettTok: 'small/tokenizer.json',
  dettTokTurbo: 'turbo/tokenizer.json',
  dettBaseEnc: 'base/onnx/encoder_model_int8_corto.onnx',
  dettBaseEncIntero: 'base/onnx/encoder_model_int8.onnx',
  dettBaseDec: 'base/onnx/decoder_model_merged_int8.onnx',
  dettSmallEnc: 'small/onnx/encoder_model_int8_corto.onnx',
  dettSmallEncIntero: 'small/onnx/encoder_model_int8.onnx',
  dettSmallDec: 'small/onnx/decoder_model_merged_int8.onnx',
  dettTurboEnc: 'turbo/onnx/encoder_model_q4f16_corto.onnx',
  dettTurboEncIntero: 'turbo/onnx/encoder_model_q4f16.onnx',
  dettTurboDec: 'turbo/onnx/decoder_model_merged_q4f16.onnx',
};

const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (u.startsWith('/modelli/') && MODELLI) {
    const f = join(MODELLI, u.slice(9));
    if (!existsSync(f)) return r.writeHead(404).end();
    const n = statSync(f).size;
    const intestazioni = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'cross-origin-resource-policy': 'cross-origin', 'accept-ranges': 'bytes' };
    if (q.method === 'OPTIONS') return r.writeHead(204, intestazioni).end();
    const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (!m) {
      r.writeHead(200, { ...intestazioni, 'content-length': n });
      return createReadStream(f).pipe(r);
    }
    const a = +m[1];
    const b = m[2] ? Math.min(+m[2], n - 1) : n - 1;
    r.writeHead(206, { ...intestazioni, 'content-range': `bytes ${a}-${b}/${n}`, 'content-length': b - a + 1 });
    return createReadStream(f, { start: a, end: b }).pipe(r);
  }
  const nome = u.slice(1) || 'input';
  if (!PAGINE[nome]) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGINE[nome]);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const profilo = mkdtempSync(join(tmpdir(), 'dettatura-e2e-'));
const args = ['--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required'];
if (AUDIO) args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${AUDIO}`);
const b = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [EXT], executablePath: process.env.CHROME, userDataDir: profilo, args });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('istanza NON headless, interrotta');
}
log('chrome headless PID', b.process().pid);

try {
  const swT = await b.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(swT.url()).host;
  const sw = await swT.worker();
  const ext = (await b.extensions()).get(extId);
  const page = await b.newPage();
  await page.setViewport({ width: 1100, height: 700 });
  // avvisi ed errori dei worker della dettatura (offscreen)
  b.on('targetcreated', async (t) => {
    if (t.type() !== 'worker' && t.type() !== 'other') return;
    try {
      const w = await t.worker();
      if (w) w.on('console', (m) => ['warn', 'error'].includes(m.type()) && log('[worker]', m.text().slice(0, 300)));
    } catch {}
  });

  /** Concede activeTab come un clic sull'icona, poi rimette il fuoco nel campo. */
  async function preparaScheda(nome, selettore, frame) {
    await page.goto(`${BASE}/${nome}`);
    await dorme(300);
    const f = frame ? page.frames().find((x) => x.url().endsWith(frame)) : page.mainFrame();
    if (selettore) await f.click(selettore);
    await page.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await dorme(300);
    await (await pt.asPage()).close();
    await page.bringToFront();
    if (selettore) await f.focus(selettore);
    await dorme(200);
    const r = await sw.evaluate(() => globalThis.__testDettaturaPagina());
    await dorme(200);
    return { r, f };
  }
  const detta = async (testo, pausa = 2) => {
    await sw.evaluate((t, p) => globalThis.__testDettato(t, p), testo, pausa);
    await dorme(150);
  };
  const fine = async () => {
    await sw.evaluate(() => globalThis.__testDettaturaFine());
    await dorme(300);
  };

  // ---- 0. scorciatoia assegnata davvero (Alt+D e' di Chrome: non si assegna) ----
  {
    const c = (await sw.evaluate(() => chrome.commands.getAll())).find((x) => x.name === 'dettatura');
    controlla('scorciatoia della dettatura assegnata', !!(c && c.shortcut), JSON.stringify(c));
  }
  // ---- 1. input ----
  {
    const { r, f } = await preparaScheda('input', '#campo');
    controlla('input: campo trovato', r.haCampo === true, JSON.stringify(r));
    await detta('Ciao Marco virgola come stai?');
    await detta('Ehm, domani chiamo Aldo.', 1.8);
    await fine();
    const v = await f.$eval('#campo', (e) => e.value);
    controlla('input: testo pulito', v === 'Ciao Marco, come stai? Domani chiamo Aldo.', JSON.stringify(v));
  }
  // ---- 2. textarea alla React ----
  {
    const { f } = await preparaScheda('react', '#campo');
    await detta('Il cliente vuole il modulo.');
    await detta('Per la home page.', 0.5);
    await detta('Nuovo paragrafo. Poi sentiamo Kian.', 1.5);
    await fine();
    const v = await f.$eval('#campo', (e) => e.value);
    const st = await f.evaluate(() => window.statoReact);
    controlla('react: testo nel campo', v === 'Il cliente vuole il modulo per la home page.\n\nPoi sentiamo Kian.', JSON.stringify(v));
    controlla('react: onChange visto (stato = valore)', st === v, JSON.stringify(st));
  }
  // ---- 3. annulla e cancella l'ultima frase ----
  {
    const { f } = await preparaScheda('input', '#campo');
    await detta('Prima frase giusta.');
    await detta('Seconda frase sbagliata.', 2);
    await detta("Cancella l'ultima frase.", 2);
    await detta('Seconda giusta.', 2);
    await detta('Parola in più.', 2);
    await detta('Annulla.', 2);
    await fine();
    const v = await f.$eval('#campo', (e) => e.value);
    controlla('input: cancella frase e annulla', v.trim() === 'Prima frase giusta. Seconda giusta.', JSON.stringify(v));
  }
  // ---- 4. editor che gestisce beforeinput (ProseMirror, Lexical) ----
  {
    const { f } = await preparaScheda('gestito', '#campo');
    await detta('Ciao Aldo virgola a capo ti mando il preventivo.');
    await fine();
    const mod = await f.evaluate(() => window.modello);
    controlla('editor gestito: testo dal beforeinput', JSON.stringify(mod) === JSON.stringify(['Ciao Aldo,', 'Ti mando il preventivo.']), JSON.stringify(mod));
  }
  // ---- 5. contenteditable semplice ----
  {
    const { f } = await preparaScheda('modificabile', '#campo');
    await detta('Elenco puntato latte.');
    await detta('Pane.', 1.5);
    await detta('Fine elenco.', 1.5);
    await fine();
    const t = await f.$eval('#campo', (e) => e.innerText);
    controlla('contenteditable: elenco', /- Latte\.\s*\n- Pane\./.test(t), JSON.stringify(t));
  }
  // ---- 6. riquadro ----
  {
    const { r, f } = await preparaScheda('riquadro', '#campo', '/riquadro-dentro');
    controlla('riquadro: campo nel frame interno', r.haCampo === true && r.frameCampo > 0, JSON.stringify(r));
    await detta('Testo nel riquadro.');
    await fine();
    const v = await f.$eval('#campo', (e) => e.value);
    controlla('riquadro: testo inserito', v === 'Testo nel riquadro.', JSON.stringify(v));
  }
  // ---- 7. nessun campo: casella ----
  {
    const { r } = await preparaScheda('nessuno', null);
    controlla('nessun campo: casella', r.haCampo === false, JSON.stringify(r));
    await detta('Questo va nella casella.');
    await dorme(200);
    const c = await page.evaluate(() => !!document.querySelector('webg-dettatura'));
    controlla('nessun campo: indicatore con casella presente', c);
    await page.screenshot({ path: join(tmpdir(), 'dettatura-casella.png') });
    await fine();
  }

  // ---- 8. primo uso con la scorciatoia tenuta giu' (ripetizione automatica della tastiera):
  // indicatore subito, UNA sola pagina della dettatura, e se e' gia' aperta si riusa ----
  {
    await preparaScheda('input', '#campo');
    await sw.evaluate(() => globalThis.__testDettaturaFine());
    const contaPagine = () => b.targets().filter((x) => x.url().includes('/dettatura.html')).length;
    const t0 = Date.now();
    const raffica = () =>
      sw.evaluate(async () => {
        const out = [];
        for (let i = 0; i < 25; i++) {
          out.push(globalThis.__testComando());
          await new Promise((r) => setTimeout(r, 40));
        }
        return Promise.all(out);
      });
    const pr = raffica();
    await page.waitForSelector('webg-dettatura', { timeout: 3000 }).catch(() => null);
    const ms = Date.now() - t0;
    const c = await page.evaluate(() => !!document.querySelector('webg-dettatura'));
    controlla('scorciatoia: indicatore subito nella pagina', c, `${ms} ms`);
    const rr = await pr;
    await dorme(2500);
    const primi = rr.filter((x) => x && x.motivo === 'primoUso').length;
    const ignorati = rr.filter((x) => x && x.ignorato).length;
    controlla('ripetizione automatica: un solo avvio, le altre pressioni ignorate', primi === 1 && ignorati === 24, `${primi} avvii, ${ignorati} ignorate`);
    controlla('primo uso: una sola pagina della dettatura', contaPagine() === 1, `${contaPagine()} pagine`);
    // seconda pressione piu' tardi: la pagina gia' aperta si riusa
    await dorme(800);
    await sw.evaluate(() => globalThis.__testComando());
    await dorme(2500);
    controlla('pagina della dettatura gia\' aperta: nessuna nuova', contaPagine() === 1, `${contaPagine()} pagine`);
    for (const x of b.targets().filter((x) => x.url().includes('/dettatura.html'))) await (await x.asPage()).close();
    await page.bringToFront();
  }

  // ---- Parte 2: microfono finto e Whisper ----
  if (MODELLI && AUDIO) {
    const mappa = {};
    for (const [k, f] of Object.entries(FILE_DETTATURA)) for (const u of f.fonti) mappa[u] = `${BASE}/modelli/${LOCALI[k]}`;
    await sw.evaluate((m) => globalThis.__testFontiDettatura(m), mappa);
    // permesso del microfono all'estensione (come dopo il clic su "Consenti")
    const cdp = await b.target().createCDPSession();
    await cdp.send('Browser.grantPermissions', { origin: `chrome-extension://${extId}`, permissions: ['audioCapture'] });
    // download e misura dalla pagina della dettatura
    const pd = await b.newPage();
    await pd.goto(`chrome-extension://${extId}/dettatura.html`);
    const mpc = await pd.evaluate(() => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaMisuraPC' }));
    log('misura del computer:', JSON.stringify(mpc));
    esiti.push({ nome: 'misura del computer', misura: mpc });
    const t0 = Date.now();
    const sc = await pd.evaluate((m) => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaScarica', modello: m }), MODELLO);
    controlla(`modello ${MODELLO} scaricato e misurato`, sc && sc.ok, JSON.stringify(sc).slice(0, 300));
    log('download + caricamento + misura:', Date.now() - t0, 'ms');
    await pd.screenshot({ path: join(tmpdir(), 'dettatura-pagina.png'), fullPage: true });
    await pd.close();
    if (MODELLO !== 'normale') await sw.evaluate((m) => chrome.storage.local.set({ dettModello: m }), MODELLO);
    // Ctrl+Spazio sul campo
    await page.goto(`${BASE}/react`);
    await page.click('#campo');
    await page.triggerExtensionAction(ext);
    const pt = await b.waitForTarget((t) => t.url().endsWith('/popup.html'), { timeout: 10000 });
    await dorme(300);
    await (await pt.asPage()).close();
    await page.bringToFront();
    await page.focus('#campo');
    // TOCCO BREVE (mani libere): pressione e rilascio subito, la dettatura resta attiva
    await dorme(800);
    await page.keyboard.down('Control');
    const av = await sw.evaluate(() => globalThis.__testComando());
    await page.keyboard.up('Control');
    controlla('tocco: dettatura avviata', av && av.avviata, JSON.stringify(av));
    await dorme(1500);
    const ancora = await sw.evaluate(() => globalThis.__testStatoDettatura());
    controlla('tocco: dopo il rilascio continua ad ascoltare', ancora && ancora.attiva === true, JSON.stringify(ancora && ancora.stato && ancora.stato.fase));
    const t1 = Date.now();
    let v = '';
    while (Date.now() - t1 < 45000) {
      v = await page.$eval('#campo', (e) => e.value);
      if (v.split(/\s+/).length >= 12) break;
      await dorme(500);
    }
    await page.screenshot({ path: join(tmpdir(), 'dettatura-ascolto.png') });
    const st = await sw.evaluate(() => globalThis.__testStatoDettatura());
    const fermo = await sw.evaluate(() => globalThis.__testComando());
    await dorme(1500);
    v = await page.$eval('#campo', (e) => e.value);
    controlla('microfono finto: testo nel campo', v.length > 20, JSON.stringify(v));
    controlla('tocco: nuova pressione ferma', fermo && fermo.fermata === true, JSON.stringify(fermo));
    log('stato motore:', JSON.stringify({ latenzaMs: st && st.stato && st.stato.latenzaMs, latenze: st && st.stato && st.stato.latenze, info: st && st.stato && st.stato.info }));
    esiti.push({ nome: 'latenza', latenzaMs: st && st.stato && st.stato.latenzaMs, testo: v });

    // PREMI PER PARLARE: tasto tenuto (con la ripetizione automatica), al rilascio trascrive e finisce
    await page.$eval('#campo', (e) => (e.value = ''));
    await page.focus('#campo');
    await dorme(1000);
    await page.keyboard.down('Control');
    const avT = await sw.evaluate(() => globalThis.__testComando());
    // ripetizione automatica per 6 secondi: nessun effetto
    const rip = await sw.evaluate(async () => {
      let ignorate = 0;
      for (let i = 0; i < 150; i++) {
        const r = await globalThis.__testComando();
        if (r && r.ignorato) ignorate++;
        await new Promise((ok) => setTimeout(ok, 40));
      }
      return ignorate;
    });
    await page.keyboard.up('Control');
    const tRil = Date.now();
    controlla('tenuto: dettatura avviata', avT && avT.avviata, JSON.stringify(avT));
    controlla('tenuto: ripetizione automatica ignorata', rip === 150, `${rip} su 150`);
    let fermata = false;
    let vT = '';
    while (Date.now() - tRil < 20000) {
      const s = await sw.evaluate(() => globalThis.__testStatoDettatura());
      vT = await page.$eval('#campo', (e) => e.value);
      if (!s.attiva && vT) {
        fermata = true;
        break;
      }
      await dorme(300);
    }
    controlla('tenuto: al rilascio si ferma e scrive', fermata && vT.length > 10, `${Date.now() - tRil} ms, ${JSON.stringify(vT)}`);
    // misura a riposo, a modello gia' caricato (la prima, subito dopo il download, risente del lavoro appena fatto)
    await dorme(5000);
    const pd3 = await b.newPage();
    await pd3.goto(`chrome-extension://${extId}/dettatura.html`);
    for (let i = 0; i < 2; i++) {
      const m2 = await pd3.evaluate((m) => chrome.runtime.sendMessage({ a: 'background', tipo: 'dettaturaScarica', modello: m }), MODELLO);
      log('misura a riposo:', JSON.stringify(m2.misura));
      esiti.push({ nome: 'misura a riposo', misura: m2.misura });
    }
    // prova nella pagina della dettatura ("Detta qui")
    await pd3.bringToFront();
    await pd3.click('#dettaQui');
    const t2 = Date.now();
    let vp = '';
    while (Date.now() - t2 < 40000) {
      vp = await pd3.$eval('#provaTesto', (e) => e.value);
      if (vp.split(/\s+/).length >= 8) break;
      await dorme(500);
    }
    await pd3.screenshot({ path: join(tmpdir(), 'dettatura-pagina-prova.png'), fullPage: true });
    await pd3.click('#dettaQui');
    await dorme(1500);
    vp = await pd3.$eval('#provaTesto', (e) => e.value);
    controlla('pagina della dettatura: Detta qui', vp.length > 20, JSON.stringify(vp));
    await pd3.close();
  }
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
const ko = esiti.filter((e) => e.ok === false);
if (process.env.USCITA) writeFileSync(process.env.USCITA, JSON.stringify(esiti, null, 1));
console.log(`\n${esiti.filter((e) => e.ok).length} OK, ${ko.length} KO`);
process.exit(ko.length ? 1 : 0);
