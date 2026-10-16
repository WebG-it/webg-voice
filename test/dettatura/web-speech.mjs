// Il riconoscimento vocale di Chrome sa l'italiano sul dispositivo (senza mandare l'audio a Google)?
// Prova SpeechRecognition.available({ langs: ['it-IT'], processLocally: true }) in Chrome headless.
//   CHROME=<chrome> node test/dettatura/web-speech.mjs
import puppeteer from 'puppeteer';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html' });
  r.end('<!doctype html><title>prova</title>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profilo = mkdtempSync(join(tmpdir(), 'web-speech-'));
const b = await puppeteer.launch({ headless: true, pipe: true, executablePath: process.env.CHROME, userDataDir: profilo, args: ['--no-first-run'] });
if (!/--headless/.test(b.process().spawnargs.join(' '))) {
  b.process().kill();
  throw new Error('non headless');
}
try {
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${server.address().port}/`);
  const r = await p.evaluate(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const out = { versione: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], esiste: !!SR, conPrefisso: !window.SpeechRecognition && !!window.webkitSpeechRecognition };
    if (!SR) return out;
    out.haAvailable = typeof SR.available === 'function';
    out.haInstall = typeof SR.install === 'function';
    const prova = async (o) => {
      try {
        return await SR.available(o);
      } catch (e) {
        return 'errore: ' + e.message;
      }
    };
    if (out.haAvailable) {
      out.itLocale = await prova({ langs: ['it-IT'], processLocally: true });
      out.itRemoto = await prova({ langs: ['it-IT'], processLocally: false });
      out.enLocale = await prova({ langs: ['en-US'], processLocally: true });
      // il pacchetto della lingua si scarica da solo: si aspetta fino a 90 secondi
      out.dopo = [];
      for (let i = 0; i < 18 && out.itLocale !== 'available'; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        out.itLocale = await prova({ langs: ['it-IT'], processLocally: true });
        out.dopo.push(out.itLocale);
      }
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
} finally {
  await b.close();
  server.close();
  try {
    rmSync(profilo, { recursive: true, force: true });
  } catch {}
}
