/**
 * Browser checks for the one-page dashboard.
 * Not a project dependency. From the repo root, after installing puppeteer-core
 * somewhere on NODE_PATH:
 *
 *   PUPPETEER_ENTRY=/tmp/dash-test/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js \
 *   CHROME_PATH=/usr/local/bin/google-chrome node pages/test_dashboard.mjs
 *
 * Uses pages/public and pages/functions/_snapshot.json. No hosted database and no secrets.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const puppeteer = process.env.PUPPETEER_ENTRY
  ? (await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default
  : (await import('puppeteer-core')).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const SNAP = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'functions', '_snapshot.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function start(mode) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/data') {
      if (mode === 'error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('nope');
        return;
      }
      const body = mode === 'empty'
        ? { projects: [], suppliers: [], labour: [], materials: [], totals: {}, etl: [], rejected: [], validation: [], _source: 'live' }
        : { ...SNAP, _source: 'live' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (path.includes('..')) {
      res.writeHead(400); res.end('bad'); return;
    }
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
    const text = msg.text();
    if (text.includes('500')) return;
    errors.push(text);
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
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const desk = await open(browser, live.address().port, 1440, 900);
    await desk.page.waitForFunction(() => (document.querySelector('#budgetFig')?.textContent || '').includes('GH₵'));
    const text = await desk.page.evaluate(() => document.body.textContent);
    for (const bit of ['GH₵11,426,147.00', 'GH₵1,900,433.58', 'GH₵5,814,700.47', 'GH₵2,144,371.38', 'GH₵273,827.18', '4,945 hours', '77.5%', 'P005', 'P009', 'No project is over', 'Synthetic', 'Do not add']) {
      assert(text.includes(bit), 'desktop missing ' + bit);
    }
    assert(!text.includes('\u2014'), 'em dash in rendered text');
    assert(!text.includes('GH₵10,133,332.61'), 'four subjects were added');
    const tabs = await desk.page.$$('.tabs');
    assert(tabs.length === 0, 'tab bar present');
    const borders = await desk.page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.card'));
      return {
        left: style.borderLeftWidth + ' ' + style.borderLeftColor,
        right: style.borderRightWidth + ' ' + style.borderRightColor,
      };
    });
    assert(borders.left === borders.right, 'card has a coloured edge bar ' + JSON.stringify(borders));
    const overflowBoxes = await desk.page.evaluate(() => [...document.querySelectorAll('.card, .figure, h2')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => (el.id || el.className) + ' ' + el.scrollWidth + '/' + el.clientWidth));
    assert(overflowBoxes.length === 0, 'text overflows its card: ' + overflowBoxes.join(', '));
    assert(desk.errors.length === 0, 'desktop errors ' + desk.errors.join(' | '));

    const mobile = await open(browser, live.address().port, 390, 844);
    await mobile.page.waitForFunction(() => (document.querySelector('#budgetFig')?.textContent || '').includes('GH₵'));
    const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, 'mobile page overflows');
    const mobileBoxes = await mobile.page.evaluate(() => [...document.querySelectorAll('.card, .figure')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => (el.id || el.className) + ' ' + el.scrollWidth + '/' + el.clientWidth));
    assert(mobileBoxes.length === 0, 'mobile text overflows: ' + mobileBoxes.join(', '));
    assert(mobile.errors.length === 0, 'mobile errors ' + mobile.errors.join(' | '));

    const blank = await open(browser, empty.address().port, 1280, 800);
    await blank.page.waitForFunction(() => {
      const el = document.querySelector('#budgetEmpty');
      return el && !el.classList.contains('hidden');
    });
    const emptyText = await blank.page.evaluate(() => document.body.textContent);
    assert(emptyText.includes('No project rows were returned'), 'empty state missing');
    assert(blank.errors.length === 0, 'empty errors ' + blank.errors.join(' | '));

    const err = await open(browser, broken.address().port, 1280, 800);
    await err.page.waitForSelector('#retry');
    const errText = await err.page.evaluate(() => document.body.textContent);
    assert(errText.includes('could not be loaded'), 'error state missing');
    assert(errText.includes('How this warehouse is organised'), 'help missing on error');
    const focused = await err.page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(focused === 'retry', 'retry button was not focused');
    assert(err.errors.length === 0, 'error-page errors ' + err.errors.join(' | '));

    console.log('PASS browser checks');
  } finally {
    await browser.close();
    live.close(); empty.close(); broken.close();
  }
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
