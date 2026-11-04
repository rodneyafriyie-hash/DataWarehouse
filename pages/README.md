# Cloudflare Pages version

Live at **https://rockshell-dw.pages.dev**. The original Worker version is also live at https://rockshell-dw.afriyierodney64.workers.dev.

* `public/` holds the static dashboard (HTML, CSS, JS, Chart.js, ERD) plus `_headers` for security and cache headers.
* `functions/api/data.js` is the Pages Function for `GET /api/data`. It calls the read-only Supabase RPC `public.rockshell_dashboard()`.
  The shared logic is in `functions/api/_shared.js`, and `functions/_snapshot.json` is the offline fallback.
* Configuration: project environment variables `SUPABASE_URL` (plain text) and `SUPABASE_KEY` (encrypted secret holding the publishable key).
  No key is stored in any static file.
* Live results are cached at the edge for 60 seconds. If Supabase is unreachable, the function serves the built-in offline copy and the footer says so.

## How it was deployed
The live site was deployed by Direct Upload through the Cloudflare API with `build_pages_deploy.py`. That script turns the same handler into an advanced-mode `_worker.js` that also serves the static files, because raw API Direct Upload can't compile `functions/`. Wrangler normally does that step.

With Git integration (Pages → Connect to Git), use build output directory `pages/public` and set the root so that `pages/functions` is picked up. Cloudflare then builds `functions/` itself. The same env vars apply.

`verify_pages.py` checks every tab in a headless browser.
