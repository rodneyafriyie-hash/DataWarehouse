# Deploy the dashboard (same Cloudflare project)

This is a coursework prototype. Deploy only to the existing project **rockshell-dw**. Do not create a second project. Do not put the Supabase key in a file or in git.

The hosted database is Supabase project `kthdkdbrokrcokngnfpy` only. The key stays a Cloudflare secret (`SUPABASE_KEY`). `SUPABASE_URL` is the plain project URL `https://kthdkdbrokrcokngnfpy.supabase.co`.

The page calls `GET /api/data`. That route calls `POST /rest/v1/rpc/rockshell_dashboard` with the existing server secret. The function reads only the four ledger-star tables. Do not expose schema `rockshell` and do not add grants. The browser never receives the key. Direct table REST is not used: `Accept-Profile: rockshell` returns 406.

No new migration is part of this dashboard change. Migration `04_private_dashboard_api.sql` remains optional and is not required here. Do not apply SQL to any project other than `kthdkdbrokrcokngnfpy`.

## Pages (the copy at rockshell-dw.pages.dev)

From the repository root, with Wrangler logged in as an account that already owns the project:

```bash
cd pages
npx wrangler pages deploy public --project-name rockshell-dw --commit-dirty=true
```

Wrangler picks up `pages/functions` when you run that command from `pages/`. The function reads `SUPABASE_URL` and `SUPABASE_KEY` from the project environment. If those are already set, do not replace them.

To set them once, without writing them into the repo:

```bash
cd pages
npx wrangler pages secret put SUPABASE_KEY --project-name rockshell-dw
```

Set the URL in the Pages project settings as a plain-text variable named `SUPABASE_URL`. Do not pass the key on the command line in a shared script. `pages/build_pages_deploy.py` also refuses to embed a key in static files, but it does place the key in a generated API upload script if the variables are present in the environment. Prefer the Wrangler command above so the key is not written to disk.

After deploy, check the live response rather than an old total:

```bash
curl -sI https://rockshell-dw.pages.dev/
curl -s https://rockshell-dw.pages.dev/api/data | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('_source'), d.get('scope'), sorted(d))"
```

Expect `_source` `live`, `scope` `ledger`, approved budget `11426147` and recorded spending `1900433.58`. The JSON should not contain procurement, suppliers, labour, or materials.

## Worker (the copy at rockshell-dw.afriyierodney64.workers.dev)

```bash
cd dashboard
python stage_worker_modules.py
npx wrangler deploy
```

`stage_worker_modules.py` copies public files next to `src/worker.js` and renames the script, JSON and SVG modules so Wrangler serves them as text. It does not read secrets. The staged copies are gitignored.

The Worker secret is set once with:

```bash
cd dashboard
npx wrangler secret put SUPABASE_KEY
```

`dashboard/build_deploy.py` is the older direct-upload helper. Run it only on a machine where `SUPABASE_URL` and `SUPABASE_KEY` are already in the environment. Do not commit `.deploy/`.

## What you are uploading

Static files live in `pages/public` (and the same HTML, CSS and JS in `dashboard/public`). The API handler does not ship an offline copy of older figures. A secret scan before deploy should find no `.env`, no service key and no Cloudflare token.
