# Cloudflare Pages copy of the ledger dashboard

Hosted prototype: **https://rockshell-dw.pages.dev**. The Worker copy is https://rockshell-dw.afriyierodney64.workers.dev. Deploy steps are in `docs/deploy.md`. Do not deploy until the simplified database contract is confirmed.

- `public/` is the static page (HTML, CSS, JS, Chart.js) plus `_headers`.
- `functions/api/data.js` serves `GET /api/data`.
- `functions/api/ledger_adapter.js` keeps approved budget, ledger spending, remaining budget, and cost categories when present. Other subjects are dropped.
- `functions/api/_shared.js` calls `public.rockshell_dashboard` with `SUPABASE_URL` and `SUPABASE_KEY`. The key is a Pages secret. A failed call returns HTTP 503 and does not reuse an older file.
- Project variables stay `SUPABASE_URL` (plain text) and `SUPABASE_KEY` (secret). Neither is stored in `public/`.

`python pages/test_contract.py` checks the adapter with synthetic fixtures. `node pages/test_dashboard.mjs` checks the page in Chrome.
