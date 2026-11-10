# Cloudflare Pages copy of the ledger dashboard

Hosted prototype: **https://rockshell-dw.pages.dev**. The Worker copy is https://rockshell-dw.afriyierodney64.workers.dev. Deploy steps are in `docs/deploy.md`. Do not deploy until the simplified database contract is confirmed.

- `public/` is the static page (HTML, CSS, JS, Chart.js) plus `_headers`.
- `functions/api/data.js` serves `GET /api/data`.
- `functions/api/ledger_adapter.js` calls `POST /rest/v1/rpc/rockshell_dashboard` and maps the verified ledger fields. It does not read tables with `Accept-Profile`.
- `functions/api/_shared.js` uses `SUPABASE_URL` and `SUPABASE_KEY`. The key is a Pages secret. A failed call returns HTTP 503 and does not reuse an older file.
- Project variables stay `SUPABASE_URL` (plain text) and `SUPABASE_KEY` (secret). Neither is stored in `public/`.

`python pages/test_contract.py` checks the adapter and builds `dist/_worker.js` without a key, then runs that file. `node pages/test_dashboard.mjs` checks the page in Chrome. Deploy from this directory so Wrangler compiles `functions/`.
