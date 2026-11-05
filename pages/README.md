# Cloudflare Pages copy of the dashboard

Hosted prototype: **https://rockshell-dw.pages.dev**. The Worker copy of the same page is https://rockshell-dw.afriyierodney64.workers.dev. Deploy steps for both are in `docs/deploy.md`.

- `public/` is the static page (HTML, CSS, JS, Chart.js, schema diagram) plus `_headers`.
- `functions/api/data.js` serves `GET /api/data`. It calls `public.rockshell_dashboard()` using `functions/api/_shared.js`.
- `functions/_snapshot.json` is the offline copy used when Supabase does not respond. It is warehouse output, not a key.
- Project variables: `SUPABASE_URL` (plain text) and `SUPABASE_KEY` (secret, the publishable key). Neither is stored in `public/`.
- Live JSON is cached at the edge for 60 seconds. The footer says when the page is showing the offline copy.

`verify_pages.py` checks a built page in Chrome if `puppeteer-core` is installed. `test_contract.py` does not need a browser.
