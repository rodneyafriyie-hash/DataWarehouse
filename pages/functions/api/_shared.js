// GET /api/data calls the existing public.rockshell_dashboard RPC.
// That function reads only the four ledger-star tables. The key stays on the
// server. A failed call returns an error and does not substitute older figures.
import { fetchLedger } from './ledger_adapter.js';

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
};

export async function handleData(request, env, waitUntil) {
  const cache = caches.default;
  const key = new Request(new URL('/api/data?v=ledger-rpc', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const view = await fetchLedger({
      baseUrl: env && env.SUPABASE_URL,
      key: env && env.SUPABASE_KEY,
      fetchImpl: fetch,
    });
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
