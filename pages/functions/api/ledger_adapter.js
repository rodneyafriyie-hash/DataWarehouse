// Maps the existing public.rockshell_dashboard JSON onto the ledger page.
// The function already reads only dim_project, dim_date, dim_cost_category,
// and fact_project_cost. This module does not call those tables over REST.
// Column names below match the verified contract of 2026-11-10.

export const LEDGER_RPC = 'rockshell_dashboard';
export const LEDGER_TABLES = ['dim_project', 'dim_date', 'dim_cost_category', 'fact_project_cost'];

const DROPPED = ['suppliers', 'labour', 'labor', 'materials', 'etl', 'etl_run', 'rejected', 'validation', 'procurement_ghs', 'material_usage_ghs', 'labour_ghs', 'client_name'];

function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
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
    const id = row && row.project_id;
    if (id === null || id === undefined || String(id).trim() === '') {
      incomplete.push({ project_id: null, reason: 'missing project id' });
      continue;
    }
    const projectId = String(id);
    if (seen.has(projectId)) {
      incomplete.push({ project_id: projectId, reason: 'duplicate project' });
      continue;
    }
    const budget = cents(row.approved_budget_ghs);
    const actual = cents(row.actual_cost_ghs);
    if (budget === null || actual === null) {
      incomplete.push({ project_id: projectId, reason: 'missing budget or actual cost' });
      continue;
    }
    seen.add(projectId);
    const remaining = budget - actual;
    const lines = Number(row.expense_lines);
    projects.push({
      project_id: projectId,
      project_name: row.project_name ? String(row.project_name) : projectId,
      project_type: row.project_type ? String(row.project_type) : '',
      location: row.location ? String(row.location) : '',
      approved_budget_ghs: money(budget),
      actual_cost_ghs: money(actual),
      remaining_budget_ghs: money(remaining),
      expense_lines: Number.isFinite(lines) ? lines : null,
      pct_budget_used: budget > 0 ? Math.round((actual * 1000) / budget) / 10 : null,
    });
  }
  projects.sort((a, b) => a.project_id.localeCompare(b.project_id, 'en'));

  const categories = [];
  if (Array.isArray(payload.categories)) {
    for (const row of payload.categories) {
      const amount = cents(row.actual_cost_ghs);
      const name = row.category_name || row.category_id;
      if (!name || amount === null) {
        incomplete.push({ project_id: null, reason: 'incomplete category row' });
        continue;
      }
      const lines = Number(row.expense_lines);
      categories.push({
        category_id: row.category_id ? String(row.category_id) : String(name),
        category_name: String(name),
        actual_cost_ghs: money(amount),
        expense_lines: Number.isFinite(lines) ? lines : null,
        project_id: null,
      });
    }
  }

  const monthly = [];
  if (Array.isArray(payload.monthly)) {
    for (const row of payload.monthly) {
      const amount = cents(row.actual_cost_ghs);
      const month = Number(row.month);
      if (!Number.isFinite(month) || amount === null) continue;
      const lines = Number(row.expense_lines);
      monthly.push({
        year: Number(row.year) || null,
        month,
        actual_cost_ghs: money(amount),
        expense_lines: Number.isFinite(lines) ? lines : null,
      });
    }
    monthly.sort((a, b) => a.month - b.month);
  }

  const sum = (key) => projects.reduce((total, row) => total + Math.round(row[key] * 100), 0);
  const budgetCents = sum('approved_budget_ghs');
  const actualCents = sum('actual_cost_ghs');
  const totals = projects.length ? {
    approved_budget_ghs: money(budgetCents),
    actual_cost_ghs: money(actualCents),
    remaining_budget_ghs: money(budgetCents - actualCents),
    expense_lines: projects.reduce((total, row) => total + (row.expense_lines || 0), 0),
    project_count: projects.length,
    pct_budget_used: budgetCents > 0 ? Math.round((actualCents * 1000) / budgetCents) / 10 : null,
  } : null;

  if (totals && payload.totals) {
    const reported = cents(payload.totals.approved_budget_ghs);
    const reportedSpend = cents(payload.totals.actual_cost_ghs);
    if (reported !== null && reported !== budgetCents) {
      incomplete.push({ project_id: null, reason: 'reported budget total does not match the sum of projects' });
    }
    if (reportedSpend !== null && reportedSpend !== actualCents) {
      incomplete.push({ project_id: null, reason: 'reported spending total does not match the sum of projects' });
    }
  }

  const categoryCents = categories.reduce((total, row) => total + Math.round(row.actual_cost_ghs * 100), 0);
  if (totals && categories.length && categoryCents !== actualCents) {
    incomplete.push({ project_id: null, reason: 'category spending does not match project spending' });
  }

  return {
    scope: 'ledger',
    tables: LEDGER_TABLES.slice(),
    design: payload.design || null,
    generated_at: payload.generated_at || null,
    projects,
    incomplete,
    categories,
    categories_status: Array.isArray(payload.categories) ? 'ready' : 'unavailable',
    monthly,
    totals,
    table_counts: payload.table_counts && typeof payload.table_counts === 'object' ? payload.table_counts : null,
    quality_checks: payload.quality_checks && typeof payload.quality_checks === 'object' ? payload.quality_checks : null,
  };
}

export async function fetchLedger({ baseUrl, key, fetchImpl }) {
  if (!baseUrl || !key) throw new Error('Supabase is not configured');
  const endpoint = new URL('/rest/v1/rpc/' + LEDGER_RPC, String(baseUrl).replace(/\/$/, '') + '/');
  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(LEDGER_RPC + ' HTTP ' + response.status);
  const raw = await response.json();
  const view = adaptLedger(raw);
  for (const name of DROPPED) {
    if (Object.prototype.hasOwnProperty.call(view, name)) throw new Error('Dropped field reached the page: ' + name);
  }
  return view;
}
