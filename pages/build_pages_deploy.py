"""Builds .deploy/pages_deploy.js for a Cloudflare Pages Direct Upload (run through the Cloudflare API / MCP execute).
Static files come from pages/public. Because Direct Upload over the raw API cannot compile the functions/ folder
(wrangler normally does that), the Function is shipped as an equivalent advanced-mode _worker.js generated from
functions/api/_shared.js. No key is embedded: SUPABASE_URL / SUPABASE_KEY are set as project env vars from the environment."""
import base64, json, os, mimetypes, blake3
P = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(P, "public")
assets = []
for root, _, files in os.walk(PUB):
    for f in sorted(files):
        full = os.path.join(root, f); rel = "/" + os.path.relpath(full, PUB).replace(os.sep, "/")
        if f in ("_headers", "_redirects", "_routes.json"): continue
        b64 = base64.b64encode(open(full, "rb").read()).decode()
        ext = os.path.splitext(f)[1][1:]
        h = blake3.blake3((b64 + ext).encode()).hexdigest()[:32]
        ctype = mimetypes.guess_type(f)[0] or "application/octet-stream"
        if f.endswith(".js"): ctype = "application/javascript"
        assets.append({"path": rel, "hash": h, "b64": b64, "type": ctype})
shared = open(os.path.join(P, "functions", "api", "_shared.js")).read()
snap = open(os.path.join(P, "functions", "_snapshot.json")).read()
embedded = {a["path"]: {"b64": a["b64"], "type": a["type"]} for a in assets}
worker = shared + f"""
const SNAPSHOT = {snap};
const EMBED = {json.dumps(embedded)};
const SEC = {{ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" }};
const DECODED = {{}};
function serveEmbedded(path) {{
  if (path === '/') path = '/index.html';
  const a = EMBED[path]; if (!a) return null;
  if (!DECODED[path]) DECODED[path] = Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0));
  const long = path === '/chart.js' || path === '/erd.png';
  const type = a.type.startsWith('text/') || a.type.includes('javascript') ? a.type + '; charset=utf-8' : a.type;
  return new Response(DECODED[path], {{ headers: {{ 'Content-Type': type, 'Cache-Control': long ? 'public, max-age=86400' : 'public, max-age=60', ...SEC }} }});
}}
export default {{
  async fetch(request, env, ctx) {{
    const url = new URL(request.url);
    if (url.pathname === '/api/data') {{
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {{ status: 405 }});
      return handleData(request, env, (p) => ctx.waitUntil(p), SNAPSHOT);
    }}
    const e = serveEmbedded(url.pathname);
    if (e) return e;
    try {{ const r = await env.ASSETS.fetch(request); if (r.status !== 404) return r; }} catch (_) {{}}
    return new Response('Not found', {{ status: 404, headers: SEC }});
  }},
}};
"""
os.makedirs(os.path.join(P, "dist"), exist_ok=True)
open(os.path.join(P, "dist", "_worker.js"), "w").write(worker)
headers = open(os.path.join(PUB, "_headers")).read()
env_vars = {"SUPABASE_URL": {"type": "plain_text", "value": os.environ["SUPABASE_URL"]},
            "SUPABASE_KEY": {"type": "secret_text", "value": os.environ["SUPABASE_KEY"]}}
js = f"""async () => {{
  const NAME = {json.dumps(os.environ.get('PAGES_PROJECT', 'rockshell-dw'))};
  const assets = [];
  const worker = {json.dumps(worker)};
  const headersFile = {json.dumps(headers)};
  const envVars = {json.dumps(env_vars)};
  const base = `/accounts/${{accountId}}/pages/projects`;
  const cfg = {{ compatibility_date: '2026-10-01', env_vars: envVars }};
  let project;
  try {{ project = (await cloudflare.request({{ method: 'GET', path: `${{base}}/${{NAME}}` }})).result; }} catch (e) {{ project = null; }}
  if (!project) {{
    project = (await cloudflare.request({{ method: 'POST', path: base, body: {{ name: NAME, production_branch: 'main',
      deployment_configs: {{ production: cfg, preview: cfg }} }} }})).result;
  }} else {{
    await cloudflare.request({{ method: 'PATCH', path: `${{base}}/${{NAME}}`, body: {{ deployment_configs: {{ production: cfg, preview: cfg }} }} }});
  }}
  const SKIP_UPLOAD = true;
  const jwt = SKIP_UPLOAD ? null : (await cloudflare.request({{ method: 'GET', path: `${{base}}/${{NAME}}/upload-token` }})).result.jwt;
  const api = async (path, body) => {{
    const r = await fetch('https://api.cloudflare.com/client/v4' + path, {{ method: 'POST',
      headers: {{ Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }}, body: JSON.stringify(body) }});
    const j = await r.json(); if (!j.success) throw new Error(path + ' ' + JSON.stringify(j.errors)); return j.result;
  }};
  let todo = [];
  if (!SKIP_UPLOAD) {{
    const hashes = assets.map(a => a.hash);
    const missing = await api('/pages/assets/check-missing', {{ hashes }});
    todo = assets.filter(a => missing.includes(a.hash));
    for (const a of todo) await api('/pages/assets/upload', [{{ key: a.hash, value: a.b64, metadata: {{ contentType: a.type }}, base64: true }}]);
    await api('/pages/assets/upsert-hashes', {{ hashes }});
  }}
  const manifest = SKIP_UPLOAD ? {{}} : Object.fromEntries(assets.map(a => [a.path, a.hash]));
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  form.append('branch', 'main');
  form.append('_headers', new Blob([headersFile], {{ type: 'text/plain' }}), '_headers');
  form.append('_worker.js', new Blob([worker], {{ type: 'application/javascript+module' }}), '_worker.js');
  const dep = (await cloudflare.request({{ method: 'POST', path: `${{base}}/${{NAME}}/deployments`, body: form }})).result;
  return {{ project: project.name, subdomain: project.subdomain, uploaded: todo.length, total: assets.length,
            deployment: dep.id, url: dep.url, stage: dep.latest_stage, aliases: dep.aliases }};
}}"""
os.makedirs(os.path.join(P, "..", ".deploy"), exist_ok=True)
open(os.path.join(P, "..", ".deploy", "pages_deploy.js"), "w").write(js)
print(len(js), [a["path"] for a in assets])
