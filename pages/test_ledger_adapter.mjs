/**
 * Checks the server route and the verified RPC shape.
 * The JSON fixture is a copy of the verified demo. The fetch mock is not a live call.
 * A separate synthetic project proves a zero-spend budget is kept once.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEDGER_RPC, LEDGER_TABLES, adaptLedger, fetchLedger } from './functions/api/ledger_adapter.js';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');
const fixture = JSON.parse(readFileSync(join(root, 'fixtures/verified_rpc_payload.json'), 'utf8'));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const pagesAdapter = readFileSync(join(root, 'functions/api/ledger_adapter.js'), 'utf8');
const workerAdapter = readFileSync(join(repo, 'dashboard/src/ledger_adapter.js'), 'utf8');
assert(pagesAdapter === workerAdapter, 'pages and worker adapters diverged');

for (const rel of [
  'pages/functions/api/ledger_adapter.js',
  'pages/functions/api/_shared.js',
  'pages/functions/api/data.js',
  'dashboard/src/ledger_adapter.js',
  'dashboard/src/worker.js',
]) {
  const text = readFileSync(join(repo, rel), 'utf8');
  assert(!text.includes('Accept-Profile'), rel + ' uses schema REST');
  assert(!text.includes('/rest/v1/dim_'), rel + ' reads a table URL');
  assert(!text.includes('fact_procurement'), rel + ' still names a removed table');
}
assert(pagesAdapter.includes("'/rest/v1/rpc/' + " + 'LEDGER_RPC') || pagesAdapter.includes('/rest/v1/rpc/' + LEDGER_RPC), 'reader must call the existing function');
assert(pagesAdapter.includes("export const LEDGER_RPC = 'rockshell_dashboard'"), 'RPC name');
assert(!existsSync(join(root, 'functions/api/ledger_source.js')), 'REST reader must not remain');
assert(LEDGER_TABLES.join() === 'dim_project,dim_date,dim_cost_category,fact_project_cost', 'table dependency');

const view = adaptLedger(fixture);
assert(view.projects.length === 12, '12 projects');
assert(view.totals.approved_budget_ghs === 11426147, 'budget once: ' + view.totals.approved_budget_ghs);
assert(view.totals.actual_cost_ghs === 1900433.58, 'spend ' + view.totals.actual_cost_ghs);
assert(view.totals.remaining_budget_ghs === 9525713.42, 'remaining ' + view.totals.remaining_budget_ghs);
assert(view.totals.pct_budget_used === 16.6, 'share ' + view.totals.pct_budget_used);
assert(view.totals.expense_lines === 400, '400 expense lines');
assert(view.table_counts.dim_project === 12 && view.table_counts.dim_date === 365, 'counts');
assert(view.table_counts.dim_cost_category === 5 && view.table_counts.fact_project_cost === 400, 'fact count');
assert(view.categories.length === 5, '5 categories');
const catSum = Math.round(view.categories.reduce((s, row) => s + Math.round(row.actual_cost_ghs * 100), 0));
assert(catSum === 190043358, 'categories match spend ' + catSum);
const monthSum = Math.round(view.monthly.reduce((s, row) => s + Math.round(row.actual_cost_ghs * 100), 0));
assert(monthSum === 190043358, 'months match spend ' + monthSum);
assert(view.projects.find((p) => p.project_id === 'P005').pct_budget_used === 77.5, 'P005 share');
assert(!JSON.stringify(view).includes('client_name'), 'client removed');
assert(!JSON.stringify(view).includes('supplier'), 'supplier removed');
assert(view.incomplete.length === 0, JSON.stringify(view.incomplete));

const withZero = adaptLedger({
  projects: [
    { project_id: 'P-A', project_name: 'Synthetic Harbour', approved_budget_ghs: 1000, actual_cost_ghs: 250, expense_lines: 2 },
    { project_id: 'P-B', project_name: 'Synthetic School', approved_budget_ghs: 400, actual_cost_ghs: 0, expense_lines: 0 },
    { project_id: 'P-A', project_name: 'Duplicate', approved_budget_ghs: 9999, actual_cost_ghs: 1, expense_lines: 1 },
  ],
  categories: [{ category_id: 'CAT01', category_name: 'Equipment', actual_cost_ghs: 250, expense_lines: 2 }],
  totals: { approved_budget_ghs: 1400, actual_cost_ghs: 250 },
});
assert(withZero.projects.length === 2, 'duplicate dropped');
assert(withZero.projects.find((p) => p.project_id === 'P-B').actual_cost_ghs === 0, 'zero spend kept');
assert(withZero.totals.approved_budget_ghs === 1400, 'zero project budget counted once');
assert(withZero.incomplete.some((row) => row.reason === 'duplicate project'), 'duplicate flagged');

const calls = [];
const loaded = await fetchLedger({
  baseUrl: 'https://kthdkdbrokrcokngnfpy.supabase.co',
  key: 'server-side-test-key',
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    assert(options.headers['Accept-Profile'] === undefined, 'no schema profile');
    assert(!String(url).includes('/rest/v1/dim_'), url);
    assert(!String(url).includes('fact_project_cost?'), url);
    return { ok: true, status: 200, json: async () => fixture };
  },
});
assert(calls.length === 1, 'one request');
assert(calls[0].options.method === 'POST', 'POST');
assert(calls[0].url.endsWith('/rest/v1/rpc/' + LEDGER_RPC), calls[0].url);
assert(calls[0].options.body === '{}', 'empty body');
assert(loaded.totals.actual_cost_ghs === 1900433.58, 'fetch maps the fixture');
assert(!calls[0].url.includes('dim_project'), 'not a table read');

console.log('PASS RPC contract (verified fixture, not a live call)');
