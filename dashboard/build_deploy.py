"""Builds .deploy/deploy.js: an async function for the Cloudflare API (MCP execute) that uploads the Worker
with its modules. The Supabase key is read from the environment and sent only as a secret binding."""
import base64, json, os
P = os.path.dirname(os.path.abspath(__file__))
mods = [("worker.js", "src/worker.js", "application/javascript+module"),
        ("index.html", "public/index.html", "text/plain"),
        ("app.js.txt", "public/app.js", "text/plain"),
        ("styles.css", "public/styles.css", "text/plain"),
        ("chart.umd.min.js.txt", "public/chart.umd.min.js", "text/plain"),
        ("snapshot.json.txt", "public/snapshot.json", "text/plain"),
        ("erd.png", "public/erd.png", "application/octet-stream")]
parts = [{"name": n, "type": t, "b64": base64.b64encode(open(os.path.join(P, f), "rb").read()).decode()} for n, f, t in mods]
meta = {"main_module": "worker.js", "compatibility_date": "2026-10-01", "observability": {"enabled": True},
        "bindings": [{"type": "plain_text", "name": "SUPABASE_URL", "text": os.environ["SUPABASE_URL"]},
                     {"type": "secret_text", "name": "SUPABASE_KEY", "text": os.environ["SUPABASE_KEY"]}]}
js = f"""async () => {{
  const NAME = 'rockshell-dw';
  const parts = {json.dumps(parts)};
  const meta = {json.dumps(meta)};
  const b = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], {{ type: 'application/json' }}));
  for (const p of parts) form.append(p.name, new Blob([b(p.b64)], {{ type: p.type }}), p.name);
  const up = await cloudflare.request({{ method: 'PUT', path: `/accounts/${{accountId}}/workers/scripts/${{NAME}}`, body: form }});
  const sub = await cloudflare.request({{ method: 'POST', path: `/accounts/${{accountId}}/workers/scripts/${{NAME}}/subdomain`, body: {{ enabled: true, previews_enabled: false }} }});
  return {{ ok: up.success, id: up.result && up.result.id, modified: up.result && up.result.modified_on, subdomain: sub.result, errors: up.errors }};
}}"""
open(os.path.join(P, ".deploy", "deploy.js"), "w").write(js)
print(len(js))
