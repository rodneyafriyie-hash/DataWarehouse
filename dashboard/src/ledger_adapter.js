// Ledger-only adapter for the Rockshell dashboard.
// The browser receives this shape and nothing else. Swap LEDGER_RPC when the
// verified four-table contract replaces public.rockshell_dashboard().
// Do not add procurement, material, labour, client, supplier, or employee fields.

export const LEDGER_TABLES = ['dim_project', 'dim_date', 'dim_cost_category', 'fact_project_cost'];
export const LEDGER_RPC = 'rockshell_dashboard';

function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function firstAmount(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== '') {
      return cents(row[key]);
    }
  }
  return null;
}

function money(centsValue) {
  return centsValue / 100;
}

export function adaptLedger(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Ledger payload was not an object');
  }
  if (!Array.isArray(payload.projects)) {
    throw new Error('Ledger payload has no project list');
  }

  const projects = [];
  const incomplete = [];
  const seen = new Set();
  for (const row of payload.projects) {
    const id = row && (row.project_id ?? row.id);
    if (id === null || id === undefined || String(id).trim() === '') {
      incomplete.push({ project_id: null, reason: 'missing project id' });
      continue;
    }
    const projectId = String(id);
    if (seen.has(projectId)) {
      incomplete.push({ project_id: projectId, reason: 'duplicate project' });
      continue;
    }
    const budget = firstAmount(row, ['approved_budget_ghs']);
    const ledger = firstAmount(row, ['ledger_cost_ghs', 'actual_cost_ghs', 'recorded_spending_ghs']);
    if (budget === null || ledger === null) {
      incomplete.push({ project_id: projectId, reason: 'missing budget or ledger amount' });
      continue;
    }
    seen.add(projectId);
    const item = {
      project_id: projectId,
      project_name: row.project_name ? String(row.project_name) : projectId,
      approved_budget_ghs: money(budget),
      ledger_cost_ghs: money(ledger),
      remaining_ghs: money(budget - ledger),
    };
    if (typeof row.ledger_lines === 'number' && Number.isFinite(row.ledger_lines)) {
      item.ledger_lines = row.ledger_lines;
    }
    projects.push(item);
  }
  projects.sort((a, b) => a.project_id.localeCompare(b.project_id, 'en'));

  let categories = null;
  let categories_status = 'unavailable';
  if (Array.isArray(payload.categories)) {
    categories = [];
    categories_status = 'ready';
    for (const row of payload.categories) {
      const amount = firstAmount(row, ['amount_ghs', 'actual_cost_ghs', 'ledger_cost_ghs']);
      const name = row && (row.category_name || row.category_id);
      if (!name || amount === null) {
        incomplete.push({ project_id: row && row.project_id ? String(row.project_id) : null, reason: 'incomplete category row' });
        continue;
      }
      categories.push({
        category_id: row.category_id ? String(row.category_id) : String(name),
        category_name: String(name),
        amount_ghs: money(amount),
        project_id: row.project_id ? String(row.project_id) : null,
      });
    }
  }

  const sum = (key) => projects.reduce((total, row) => total + Math.round(row[key] * 100), 0);
  const totals = projects.length ? {
    approved_budget_ghs: money(sum('approved_budget_ghs')),
    ledger_cost_ghs: money(sum('ledger_cost_ghs')),
    remaining_ghs: money(sum('remaining_ghs')),
    project_count: projects.length,
  } : null;

  return {
    scope: 'ledger',
    tables: LEDGER_TABLES.slice(),
    generated_at: payload.generated_at || null,
    projects,
    incomplete,
    categories,
    categories_status,
    totals,
  };
}
