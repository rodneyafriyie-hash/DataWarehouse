/**
 * Browser checks against a local synthetic ledger payload.
 * These amounts are fixtures, not the hosted warehouse.
 *
 *   PUPPETEER_ENTRY=/tmp/dash-test/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js \
 *   CHROME_PATH=/usr/local/bin/google-chrome node pages/test_dashboard.mjs
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const puppeteer = process.env.PUPPETEER_ENTRY
  ? (await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default
  : (await import('puppeteer-core')).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const SYNTHETIC = {
  _source: 'live',
  scope: 'ledger',
  tables: ['dim_project', 'dim_date', 'dim_cost_category', 'fact_project_cost'],
  generated_at: '2026-11-10T12:00:00Z',
  categories_status: 'ready',
  incomplete: [],
  projects: [
    { project_id: 'P-A', project_name: 'Synthetic Harbour', approved_budget_ghs: 1000, ledger_cost_ghs: 250, remaining_ghs: 750, ledger_lines: 2 },
    { project_id: 'P-B', project_name: 'Synthetic School', approved_budget_ghs: 400, ledger_cost_ghs: 0, remaining_ghs: 400, ledger_lines: 0 },
  ],
  categories: [
    { category_id: 'CAT01', category_name: 'Equipment', amount_ghs: 180, project_id: null },
    { category_id: 'CAT05', category_name: 'Permits', amount_ghs: 70, project_id: null },
  ],
  totals: { approved_budget_ghs: 1400, ledger_cost_ghs: 250, remaining_ghs: 1150, project_count: 2 },
};
const NO_CATEGORY = { ...SYNTHETIC, categories: null, categories_status: 'unavailable' };

function start(mode) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/data') {
      if (mode === 'error') {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Live ledger figures are unavailable', detail: 'synthetic outage' }));
        return;
      }
      const body = mode === 'empty'
        ? { _source: 'live', scope: 'ledger', projects: [], incomplete: [], categories: null, categories_status: 'unavailable', totals: null, generated_at: null }
        : mode === 'nocat' ? NO_CATEGORY : SYNTHETIC;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (path.includes('..')) { res.writeHead(400); res.end('bad'); return; }
    try {
      const data = readFileSync(join(ROOT, path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('missing');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function open(browser, port, width, height) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.text().includes('503')) return;
    errors.push(msg.text());
  });
  await page.setViewport({ width, height });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
  return { page, errors };
}

async function main() {
  const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
  const live = await start('live');
  const empty = await start('empty');
  const broken = await start('error');
  const nocat = await start('nocat');
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    protocolTimeout: 20000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const desk = await open(browser, live.address().port, 1440, 1000);
    await desk.page.waitForFunction(() => (document.querySelector('#budgetFig')?.textContent || '').includes('GH₵1,400.00'));
    const text = await desk.page.evaluate(() => document.body.textContent);
    for (const bit of ['GH₵1,400.00', 'GH₵250.00', 'GH₵1,150.00', 'Synthetic Harbour', 'Synthetic School', 'Equipment', 'Not a profit figure', 'not percent complete']) {
      assert(text.includes(bit), 'missing ' + bit);
    }
    for (const banned of ['Purchases', 'supplier', 'procurement', 'GH₵11,426,147.00']) {
      assert(!text.includes(banned), 'unexpected ' + banned);
    }
    assert(!text.includes('\u2014'), 'em dash');
    await desk.page.select('#projectFilter', 'P-B');
    await desk.page.waitForFunction(() => document.querySelector('#budgetFig')?.textContent === 'GH₵400.00');
    const filtered = await desk.page.evaluate(() => document.querySelector('#ledgerFig').textContent);
    assert(filtered === 'GH₵0.00', 'zero-spend project filter ' + filtered);
    const remain = await desk.page.evaluate(() => document.querySelector('#remainFig').textContent);
    assert(remain === 'GH₵400.00', 'remaining for zero spend');
    const boxes = await desk.page.evaluate(() => [...document.querySelectorAll('.card, .figure')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => el.className));
    assert(boxes.length === 0, 'overflow ' + boxes.join(','));
    assert(desk.errors.length === 0, desk.errors.join(' | '));

    const mobile = await open(browser, live.address().port, 390, 844);
    await mobile.page.waitForFunction(() => (document.querySelector('#budgetFig')?.textContent || '').includes('GH₵'));
    const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, 'mobile overflow');
    assert(mobile.errors.length === 0, mobile.errors.join(' | '));

    const blank = await open(browser, empty.address().port, 1280, 800);
    await blank.page.waitForFunction(() => !document.querySelector('#empty').classList.contains('hidden'));
    const emptyText = await blank.page.evaluate(() => document.body.textContent);
    assert(emptyText.includes('no projects'), 'empty state');
    assert(!emptyText.includes('GH₵0.00'), 'empty state invented a zero total');

    const quiet = await open(browser, nocat.address().port, 1280, 800);
    await quiet.page.waitForFunction(() => document.querySelector('#categoryEmpty') && !document.querySelector('#categoryEmpty').classList.contains('hidden'));
    const quietText = await quiet.page.evaluate(() => document.querySelector('#categoryEmpty').textContent);
    assert(quietText.includes('not in this response'), quietText);

    const err = await open(browser, broken.address().port, 1280, 800);
    await err.page.waitForSelector('#retry');
    const errText = await err.page.evaluate(() => document.body.textContent);
    assert(errText.includes('could not be loaded'), 'error copy');
    assert(errText.includes('Nothing else is shown'), 'error refuses a fallback');
    assert(!errText.includes('GH₵'), 'error showed figures');
    assert((await err.page.evaluate(() => document.activeElement && document.activeElement.id)) === 'retry', 'retry focus');

    console.log('PASS browser checks (synthetic ledger)');
    console.log('PORTS', JSON.stringify({ live: live.address().port, mobile: live.address().port }));
  } finally {
    await browser.close();
    live.close(); empty.close(); broken.close(); nocat.close();
  }
}

main().catch((err) => { console.error('FAIL', err); process.exit(1); });
