// Caricamento sul Chrome Web Store via API ufficiale, senza console.
//
//   node scripts/store-api.mjs accedi            una volta: consenso con l'account del publisher
//   node scripts/store-api.mjs stato             versione pubblicata e in revisione
//   node scripts/store-api.mjs carica [zip]      carica il pacchetto (di serie dist/webg-voice-<versione>.zip)
//   node scripts/store-api.mjs pubblica          invia in revisione l'ultimo pacchetto caricato
//
// Credenziali fuori dal repo: %USERPROFILE%\.webg-store\client.json (client OAuth desktop del
// progetto Google Cloud seo-webg) e token.json (refresh token, scritto da "accedi").
// Variabile WEBG_STORE_DIR per spostarle. Niente segreti stampati a schermo.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ITEM = process.env.WEBG_STORE_ITEM || 'ekblhgobhioceolefpbjbebjdhgbkpdm';
const DIR = process.env.WEBG_STORE_DIR || path.join(os.homedir(), '.webg-store');
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API = 'https://www.googleapis.com/chromewebstore/v1.1/items';
const UPLOAD = 'https://www.googleapis.com/upload/chromewebstore/v1.1/items';

const leggiJson = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const client = () => leggiJson('client.json').installed;

async function token() {
  const { client_id, client_secret, token_uri } = client();
  const { refresh_token } = leggiJson('token.json');
  const r = await fetch(token_uri, {
    method: 'POST',
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token rifiutato: ${j.error} ${j.error_description || ''}`);
  return j.access_token;
}

async function chiama(url, opzioni = {}) {
  const r = await fetch(url, {
    ...opzioni,
    headers: { Authorization: `Bearer ${await token()}`, 'x-goog-api-version': '2', ...(opzioni.headers || {}) },
  });
  const testo = await r.text();
  let j;
  try { j = JSON.parse(testo); } catch { j = { testo }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function accedi() {
  const { client_id, client_secret, auth_uri, token_uri } = client();
  const server = http.createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const url = `${auth_uri}?${new URLSearchParams({
    client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', login_hint: process.env.WEBG_STORE_ACCOUNT || '',
  })}`;
  fs.writeFileSync(path.join(DIR, 'consenso-url.txt'), url);
  console.log(`Pagina di consenso: ${url}`);
  if (process.platform === 'win32') execFile('explorer.exe', [url]);
  const code = await new Promise((ok, ko) => {
    server.on('request', (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(q.get('code') ? '<p>WebG: accesso allo store collegato, puoi chiudere questa scheda.</p>' : '<p>Consenso non dato.</p>');
      if (q.get('code')) ok(q.get('code')); else if (q.get('error')) ko(new Error(q.get('error')));
    });
    setTimeout(() => ko(new Error('nessun consenso entro 15 minuti')), 15 * 60 * 1000);
  });
  server.close();
  const r = await fetch(token_uri, {
    method: 'POST',
    body: new URLSearchParams({ code, client_id, client_secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  if (!j.refresh_token) throw new Error(`nessun refresh token: ${j.error || JSON.stringify(Object.keys(j))}`);
  fs.writeFileSync(path.join(DIR, 'token.json'), JSON.stringify({ refresh_token: j.refresh_token, creato: new Date().toISOString() }));
  console.log('Collegato: token salvato in', path.join(DIR, 'token.json'));
}

async function stato() {
  const j = await chiama(`${API}/${ITEM}?projection=DRAFT`);
  console.log(JSON.stringify(j, null, 2));
}

async function carica(zip) {
  if (!zip) {
    const v = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8')).version;
    zip = `dist/webg-voice-${v}.zip`;
  }
  const corpo = fs.readFileSync(zip);
  console.log(`Carico ${zip} (${(corpo.length / 1e6).toFixed(1)} MB) su ${ITEM}`);
  const j = await chiama(`${UPLOAD}/${ITEM}?uploadType=media`, {
    method: 'PUT', body: corpo, headers: { 'Content-Type': 'application/zip' },
  });
  console.log(JSON.stringify(j, null, 2));
  if (j.uploadState === 'FAILURE') process.exit(1);
}

async function pubblica() {
  const j = await chiama(`${API}/${ITEM}/publish`, { method: 'POST', headers: { 'Content-Length': '0' } });
  console.log(JSON.stringify(j, null, 2));
}

const [comando, arg] = process.argv.slice(2);
const azioni = { accedi, stato, carica: () => carica(arg), pubblica };
if (!azioni[comando]) {
  console.log('Uso: node scripts/store-api.mjs accedi|stato|carica [zip]|pubblica');
  process.exit(2);
}
azioni[comando]().catch((e) => { console.error('Errore:', e.message); process.exit(1); });
