// GET /api/data for the ledger dashboard.
// Calls the existing read-only RPC with the Worker/Pages secret, then keeps
// only dim_project budget and fact_project_cost spending. Unused subjects are
// dropped here and are not sent to the browser. A failed call returns an error.
// It does not substitute an older copy of the figures.
import { adaptLedger, LEDGER_RPC } from './ledger_adapter.js';

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
};

export async function handleData(request, env, waitUntil) {
  const cache = caches.default;
  const key = new Request(new URL('/api/data?v=ledger', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('Supabase is not configured');
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${LEDGER_RPC}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const raw = await r.json();
    const view = adaptLedger(raw);
    view._source = 'live';
    const resp = new Response(JSON.stringify(view), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Data-Source': 'live',
      ...SEC,
    } });
    if (waitUntil) waitUntil(cache.put(key, resp.clone()));
    return resp;
  } catch (e) {
    console.error('ledger fetch failed:', e.message);
    return new Response(JSON.stringify({
      error: 'Live ledger figures are unavailable',
      detail: e.message,
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Data-Source': 'error',
        ...SEC,
      },
    });
  }
}
