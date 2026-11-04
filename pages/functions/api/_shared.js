// Shared logic for GET /api/data (used by the Pages Function and the generated _worker.js).
// Calls the read-only Supabase RPC public.rockshell_dashboard() with the key from the environment
// (Pages secret SUPABASE_KEY, var SUPABASE_URL). Live results are edge-cached for 60 s; if Supabase
// is unreachable the built-in offline copy is returned instead.
export async function handleData(request, env, waitUntil, snapshot) {
  const cache = caches.default;
  const key = new Request(new URL('/api/data?v=1', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let body, source = 'live';
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('Supabase not configured');
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/rockshell_dashboard`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const d = await r.json();
    if (!d || !d.earned_value) throw new Error('Unexpected payload');
    d._source = 'live';
    body = JSON.stringify(d);
  } catch (e) {
    console.error('live fetch failed, serving offline copy:', e.message);
    const d = typeof snapshot === 'string' ? JSON.parse(snapshot) : structuredClone(snapshot);
    d._source = 'snapshot';
    body = JSON.stringify(d);
    source = 'snapshot';
  }
  const resp = new Response(body, { headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': source === 'live' ? 'public, max-age=60' : 'no-store',
    'X-Data-Source': source, 'X-Content-Type-Options': 'nosniff' } });
  if (source === 'live') waitUntil(cache.put(key, resp.clone()));
  return resp;
}
