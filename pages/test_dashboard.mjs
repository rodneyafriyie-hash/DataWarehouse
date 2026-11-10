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
import { adaptLedger } from './functions/api/ledger_adapter.js';

const puppeteer = process.env.PUPPETEER_ENTRY
  ? (await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default
  : (await import('puppeteer-core')).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const FIXTURE = {
  ...adaptLedger(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/verified_rpc_payload.json'), 'utf8'))),
  _source: 'fixture',
};
const ZERO = {
  _source: 'fixture',
  scope: 'ledger',
  projects: [
    { project_id: 'P-A', project_name: 'Synthetic Harbour', approved_budget_ghs: 1000, actual_cost_ghs: 250, remaining_budget_ghs: 750, expense_lines: 2, pct_budget_used: 25 },
    { project_id: 'P-B', project_name: 'Synthetic School', approved_budget_ghs: 400, actual_cost_ghs: 0, remaining_budget_ghs: 400, expense_lines: 0, pct_budget_used: 0 },
  ],
  categories: [{ category_id: 'CAT01', category_name: 'Equipment', actual_cost_ghs: 250, expense_lines: 2, project_id: null }],
  categories_status: 'ready',
  monthly: [],
  incomplete: [],
  totals: { approved_budget_ghs: 1400, actual_cost_ghs: 250, remaining_budget_ghs: 1150, project_count: 2 },
};
const NO_CATEGORY = { ...FIXTURE, categories: null, categories_status: 'unavailable' };

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
        ? { _source: 'fixture', scope: 'ledger', projects: [], incomplete: [], categories: null, categories_status: 'unavailable', monthly: [], totals: null, generated_at: null }
        : mode === 'nocat' ? NO_CATEGORY : mode === 'zero' ? ZERO : FIXTURE;
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
  const zeroSrv = await start('zero');
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    protocolTimeout: 20000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const desk = await open(browser, live.address().port, 1440, 1000);
    await desk.page.waitForFunction(() => (document.querySelector('#budgetFig')?.textContent || '').includes('GH₵11,426,147.00'));
    const text = await desk.page.evaluate(() => document.body.textContent);
    for (const bit of ['GH₵11,426,147.00', 'GH₵1,900,433.58', 'GH₵9,525,713.42', 'Utilities', '16.6% of the approved budget', 'not a live warehouse call', 'Not a profit figure']) {
      assert(text.includes(bit), 'missing ' + bit);
    }
    for (const banned of ['Purchases', 'supplier', 'procurement', 'client_name']) {
      assert(!text.includes(banned), 'unexpected ' + banned);
    }
    assert(!text.includes('\u2014'), 'em dash');
    await desk.page.select('#projectFilter', 'P005');
    await desk.page.waitForFunction(() => (document.querySelector('#ledgerFig')?.textContent || '') === 'GH₵197,866.56');
    const boxes = await desk.page.evaluate(() => [...document.querySelectorAll('.card, .figure')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => el.className));
    assert(boxes.length === 0, 'overflow ' + boxes.join(','));
    assert(desk.errors.length === 0, desk.errors.join(' | '));

    const zero = await open(browser, zeroSrv.address().port, 1280, 800);
    await zero.page.select('#projectFilter', 'P-B');
    await zero.page.waitForFunction(() => document.querySelector('#ledgerFig')?.textContent === 'GH₵0.00');
    assert((await zero.page.evaluate(() => document.querySelector('#remainFig').textContent)) === 'GH₵400.00', 'zero spend remaining');
    assert((await zero.page.evaluate(() => document.querySelector('footer').textContent)).includes('not a live warehouse call'), 'zero fixture labeled');

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
    live.close(); empty.close(); broken.close(); nocat.close(); zeroSrv.close();
  }
}

main().catch((err) => { console.error('FAIL', err); process.exit(1); });
