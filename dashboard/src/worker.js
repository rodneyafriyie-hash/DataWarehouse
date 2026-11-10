// Rockshell ledger dashboard. The Supabase key stays a Worker secret.
// The browser receives only the ledger adapter output.
import INDEX from './index.html';
import APP from './app.js.txt';
import CSS from './styles.css';
import CHART from './chart.umd.min.js.txt';
import ERD from './erd.png';
import SCHEMA from './schema.svg.txt';
import { adaptLedger, LEDGER_RPC } from './ledger_adapter.js';

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
};
const STATIC = {
  '/': [INDEX, 'text/html; charset=utf-8', 'public, max-age=60'],
  '/index.html': [INDEX, 'text/html; charset=utf-8', 'public, max-age=60'],
  '/app.js': [APP, 'application/javascript; charset=utf-8', 'public, max-age=300'],
  '/styles.css': [CSS, 'text/css; charset=utf-8', 'public, max-age=300'],
  '/chart.js': [CHART, 'application/javascript; charset=utf-8', 'public, max-age=86400'],
  '/erd.png': [ERD, 'image/png', 'public, max-age=86400'],
  '/schema.svg': [SCHEMA, 'image/svg+xml', 'public, max-age=86400'],
};

async function apiData(request, env, ctx) {
  const cache = caches.default;
  const key = new Request(new URL('/api/data?v=ledger', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('Supabase is not configured');
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${LEDGER_RPC}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const view = adaptLedger(await r.json());
    view._source = 'live';
    const resp = new Response(JSON.stringify(view), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Data-Source': 'live',
      ...SEC,
    } });
    ctx.waitUntil(cache.put(key, resp.clone()));
    return resp;
  } catch (e) {
    console.error('ledger fetch failed:', e.message);
    return new Response(JSON.stringify({ error: 'Live ledger figures are unavailable', detail: e.message }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Data-Source': 'error', ...SEC },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: SEC });
    if (url.pathname === '/api/data') return apiData(request, env, ctx);
    if (url.pathname === '/health') return new Response('ok', { headers: SEC });
    const s = STATIC[url.pathname];
    if (s) return new Response(s[0], { headers: { 'Content-Type': s[1], 'Cache-Control': s[2], ...SEC } });
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', ...SEC } });
  },
};
