// Rockshell International Ltd. Data Warehouse - Cloudflare Worker
// Serves the dashboard and proxies ONE read-only RPC (public.rockshell_dashboard) on Supabase.
// The Supabase key is a Worker secret (env.SUPABASE_KEY); the browser never sees it.
import INDEX from './index.html';
import APP from './app.js.txt';
import CSS from './styles.css';
import CHART from './chart.umd.min.js.txt';
import ERD from './erd.png';
import SCHEMA from './schema.svg.txt';
import SNAPSHOT from './snapshot.json.txt';

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

async function liveData(env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/rockshell_dashboard`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const d = await r.json();
  if (!d || !d.projects) throw new Error('Unexpected payload');
  d._source = 'live';
  return d;
}

async function apiData(request, env, ctx) {
  const cache = caches.default;
  const key = new Request(new URL('/api/data?v=cw4', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let body, status = 'live';
  try {
    body = JSON.stringify(await liveData(env));
  } catch (e) {
    console.error('live fetch failed, serving offline copy:', e.message);
    const snap = typeof SNAPSHOT === 'string' ? JSON.parse(SNAPSHOT) : SNAPSHOT;
    const d = typeof structuredClone === 'function' ? structuredClone(snap) : JSON.parse(JSON.stringify(snap));
    d._source = 'snapshot'; body = JSON.stringify(d); status = 'snapshot';
  }
  const resp = new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 'live' ? 'public, max-age=60' : 'no-store', 'X-Data-Source': status, ...SEC } });
  if (status === 'live') ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
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
