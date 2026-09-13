// Service de rendu : charge une page dans Chromium sans tête et renvoie le HTML rendu
// ainsi que les réponses JSON observées pendant le chargement. Réseau interne uniquement, aucune clé.
import http from 'node:http';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT ?? 3100);
const MAX_WAIT_MS = 30_000;
const MAX_JSON_BYTES = 1_000_000;
const UA = process.env.RENDER_USER_AGENT ?? 'trading-personal-manager-renderer/0.3 (+veille personnelle)';

let browser = null;
let busy = Promise.resolve();

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'] });
  return browser;
}

async function render(url, waitMs) {
  const b = await getBrowser();
  const context = await b.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  const page = await context.newPage();
  const jsonResponses = [];
  page.on('response', async (res) => {
    try {
      const ct = (res.headers()['content-type'] ?? '').toLowerCase();
      if (!ct.includes('json')) return;
      const len = Number(res.headers()['content-length'] ?? 0);
      if (len > MAX_JSON_BYTES) return;
      const text = await res.text();
      if (text.length > MAX_JSON_BYTES) return;
      let topKeys = [];
      try {
        const parsed = JSON.parse(text);
        topKeys = Array.isArray(parsed) ? ['[array]', ...(parsed[0] && typeof parsed[0] === 'object' ? Object.keys(parsed[0]).slice(0, 12) : [])] : Object.keys(parsed ?? {}).slice(0, 20);
      } catch { return; }
      jsonResponses.push({ url: res.url(), status: res.status(), size: text.length, contentType: ct, topKeys, preview: text.slice(0, 600) });
    } catch { /* réponse non lisible */ }
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: MAX_WAIT_MS });
  } catch {
    // networkidle peut ne jamais arriver sur une page avec un flux permanent : on garde ce qui est chargé.
  }
  await page.waitForTimeout(Math.min(Math.max(0, waitMs ?? 3000), 15_000));
  const html = await page.content();
  const finalUrl = page.url();
  await context.close();
  // Un seul appel par URL est conservé (le plus récent).
  const seen = new Map();
  for (const r of jsonResponses) seen.set(r.url, r);
  return { html, finalUrl, jsonResponses: [...seen.values()] };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404); return res.end();
  }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy(); });
  req.on('end', () => {
    let input;
    try { input = JSON.parse(body); } catch { res.writeHead(400); return res.end('JSON attendu'); }
    if (!input?.url || !/^https?:\/\//.test(input.url)) { res.writeHead(400); return res.end('url http(s) attendue'); }
    // Un rendu à la fois : la mémoire est bornée, pas la file d'attente.
    busy = busy.then(async () => {
      try {
        const out = await render(input.url, Number(input.waitMs ?? 3000));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`renderer prêt sur :${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await browser?.close().catch(() => {}); process.exit(0); });
