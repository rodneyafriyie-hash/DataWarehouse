/**
 * Synthetic contract checks for the ledger adapter.
 * These figures are invented for the test. They are not the hosted warehouse.
 */
import { adaptLedger, LEDGER_TABLES } from './functions/api/ledger_adapter.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pagesAdapter = readFileSync(join(root, 'functions/api/ledger_adapter.js'), 'utf8');
const workerAdapter = readFileSync(join(root, '../dashboard/src/ledger_adapter.js'), 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const galaxy = {
  generated_at: '2026-01-01T00:00:00Z',
  projects: [
    { project_id: 'P-B', project_name: 'Synthetic School', client_name: 'Should drop', approved_budget_ghs: 400, ledger_cost_ghs: 0, ledger_lines: 0, budget_less_ledger_cost_ghs: 400 },
    { project_id: 'P-A', project_name: 'Synthetic Harbour', client_name: 'Should drop', approved_budget_ghs: 1000, ledger_cost_ghs: 250.004, ledger_lines: 2 },
    { project_id: 'P-A', project_name: 'Duplicate', approved_budget_ghs: 9999, ledger_cost_ghs: 1 },
    { project_id: 'P-C', project_name: 'Missing ledger', approved_budget_ghs: 10 },
  ],
  suppliers: [{ supplier_name: 'Must not pass', purchase_total_ghs: 50 }],
  labour: [{ labor_cost_ghs: 20 }],
  materials: [{ usage_cost_ghs: 30 }],
  totals: { approved_budget_ghs: 999999, procurement_ghs: 123, ledger_cost_ghs: 1 },
};

const view = adaptLedger(galaxy);
assert(view.tables.join() === LEDGER_TABLES.join(), 'table list');
assert(view.projects.length === 2, 'two complete projects');
assert(view.projects[0].project_id === 'P-A', 'sorted by project id');
assert(view.projects[0].approved_budget_ghs === 1000, 'budget once');
assert(view.projects[0].ledger_cost_ghs === 250, 'ledger rounded');
assert(view.projects[0].remaining_ghs === 750, 'remaining computed');
assert(view.projects[1].ledger_cost_ghs === 0, 'zero spend kept');
assert(view.projects[1].remaining_ghs === 400, 'zero spend remaining');
assert(view.totals.approved_budget_ghs === 1400, 'budgets summed once');
assert(view.totals.ledger_cost_ghs === 250, 'ledger sum ignores duplicate and missing');
assert(view.totals.remaining_ghs === 1150, 'remaining sum');
assert(view.incomplete.length === 2, 'duplicate and missing flagged');
assert(view.categories === null && view.categories_status === 'unavailable', 'no invented categories');
const dumped = JSON.stringify(view);
for (const banned of ['supplier', 'procurement', 'labour', 'labor', 'material', 'client', 'Should drop', 'Must not pass']) {
  assert(!dumped.toLowerCase().includes(banned), 'leaked ' + banned);
}

const future = adaptLedger({
  generated_at: null,
  projects: [{ project_id: 'P-Z', project_name: 'Synthetic Yard', approved_budget_ghs: 80, actual_cost_ghs: 80 }],
  categories: [
    { category_id: 'CAT01', category_name: 'Equipment', amount_ghs: 50, project_id: 'P-Z' },
    { category_id: 'CAT05', category_name: 'Permits', actual_cost_ghs: 30, project_id: 'P-Z' },
    { category_name: '', amount_ghs: 5 },
  ],
});
assert(future.projects[0].ledger_cost_ghs === 80 && future.projects[0].remaining_ghs === 0, 'actual_cost alias');
assert(future.categories_status === 'ready' && future.categories.length === 2, 'categories passed');
assert(future.categories[1].amount_ghs === 30, 'actual_cost category alias');
assert(future.incomplete.some((row) => row.reason === 'incomplete category row'), 'blank category flagged');

const empty = adaptLedger({ projects: [] });
assert(empty.totals === null && empty.projects.length === 0, 'empty is not a zero total');

let threw = false;
try { adaptLedger({ suppliers: [] }); } catch { threw = true; }
assert(threw, 'missing project list throws');

assert(pagesAdapter === workerAdapter, 'pages and worker adapters diverged');
assert(!pagesAdapter.includes('\u2014'), 'em dash in adapter');

console.log('PASS ledger adapter (synthetic fixtures)');
