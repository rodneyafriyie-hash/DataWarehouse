/* Rockshell International Ltd. Data Warehouse - dashboard front end (reads /api/data) */
(() => {
  const NAVY = '#1f2a44', ORANGE = '#f28c28';
  const CAT_COLORS = { MAT: '#1f2a44', LAB: '#f28c28', EQP: '#4f6fa8', SUB: '#ffb066', OVH: '#9aa6bf' };
  const PALETTE = ['#1f2a44', '#f28c28', '#4f6fa8', '#ffb066', '#9aa6bf', '#2e9d5b', '#d64545', '#7a5195'];
  let D = null, charts = {}, project = 'ALL';

  const $ = (id) => document.getElementById(id);
  const n = (v) => (v === null || v === undefined ? 0 : Number(v));
  const sign = (x) => (x < 0 ? '−' : '');
  const ghs = (v, d = 0) => sign(n(v)) + 'GH₵' + Math.abs(n(v)).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ghsM = (v) => { const x = n(v), a = Math.abs(x); return a >= 1e6 ? sign(x) + 'GH₵' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? sign(x) + 'GH₵' + (a / 1e3).toFixed(1) + 'K' : ghs(x); };
  const num = (v, d = 0) => n(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => (v === null || v === undefined ? '–' : n(v).toFixed(d) + '%');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;
  const pname = (id) => (D.projects.find((p) => p.project_id === id) || {}).project_name || id;
  const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

  function table(el, cols, rows) {
    const head = '<tr>' + cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('') + '</tr>';
    const body = rows.map((r) => '<tr>' + cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('') + '</tr>').join('');
    $(el).innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  }
  function cards(el, items) {
    $(el).innerHTML = items.map((c) => `<div class="card ${c.cls || ''}"><div class="label">${c.l}</div><div class="value">${c.v}</div>${c.note ? `<div class="note">${c.note}</div>` : ''}</div>`).join('');
  }
  function chart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } } }, cfg.options || {});
    charts[id] = new Chart($(id), cfg);
  }
  const moneyAxis = { ticks: { callback: (v) => ghsM(v) }, grid: { color: '#eef1f6' } };
  const inProj = (r) => project === 'ALL' || r.p === project || r.project_id === project;

  /* ---------------- pages ---------------- */
  function overview() {
    const P = D.portfolio, dq = D.dq_summary;
    const ev = D.earned_value.filter(inProj), bva = D.budget_vs_actual.filter(inProj);
    const budget = bva.reduce((s, r) => s + n(r.approved_budget), 0), actual = bva.reduce((s, r) => s + n(r.actual_cost), 0);
    const overrun = ev.reduce((s, r) => s + Math.max(-n(r.vac), 0), 0), red = ev.filter((r) => r.cost_status === 'Red').length;
    const items = project === 'ALL'
      ? [{ l: 'Active projects', v: P.active_projects, note: `${D.projects.length} projects in the warehouse`, cls: 'navy' },
         { l: 'Approved budget', v: ghsM(budget), note: 'Latest approved budget versions' },
         { l: 'Actual cost to date', v: ghsM(actual), note: pct(100 * actual / budget) + ' of budget spent', cls: 'navy' },
         { l: 'Forecast overrun', v: ghsM(overrun), note: 'Sum of negative VAC (EAC above BAC)', cls: 'red' },
         { l: 'Projects in Red', v: red, note: 'CPI below 0.90', cls: 'red' },
         { l: 'Reconciliations', v: `${dq.reconciliations_pass}/${dq.reconciliations_total}`, note: 'Checks passed in the latest ETL run', cls: 'green' }]
      : (() => { const e = ev[0] || {}; return [
         { l: 'Project', v: esc(pname(project)), note: esc((D.projects.find((p) => p.project_id === project) || {}).current_status || ''), cls: 'navy' },
         { l: 'Budget at completion', v: ghsM(e.bac) }, { l: 'Actual cost (AC)', v: ghsM(e.ac), cls: 'navy' },
         { l: 'CPI', v: num(e.cpi, 3), note: pill(e.cost_status), cls: e.cost_status === 'Red' ? 'red' : e.cost_status === 'Green' ? 'green' : '' },
         { l: 'EAC', v: ghsM(e.eac), note: 'Forecast cost at completion' },
         { l: 'VAC', v: ghsM(e.vac), note: n(e.vac) < 0 ? 'Forecast overrun' : 'Forecast under budget', cls: n(e.vac) < 0 ? 'red' : 'green' }]; })();
    cards('kpiCards', items);

    const rows = D.monthly_spend.filter(inProj), months = [...new Set(rows.map((r) => r.m))].sort();
    $('trendHint').textContent = (project === 'ALL' ? 'All projects' : pname(project)) + ' · general-ledger actuals, GH₵ per month';
    chart('trendChart', { type: 'bar', data: { labels: months, datasets: D.cost_categories.map((c) => ({ label: c.name, backgroundColor: CAT_COLORS[c.code],
        data: months.map((m) => rows.filter((r) => r.m === m && r.c === c.code).reduce((s, r) => s + n(r.v), 0)) })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, moneyAxis) },
                 plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ghs(c.raw)}` } } } } });

    table('healthTable', [
      { h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'Type', k: 'project_type' }, { h: 'Town', k: 'town' },
      { h: 'Manager', k: 'current_manager' }, { h: 'Status', k: 'current_status' },
      { h: 'Budget', num: 1, f: (r) => ghs(r.approved_budget) }, { h: 'Actual', num: 1, f: (r) => ghs(r.actual_cost) },
      { h: '% spent', num: 1, f: (r) => pct(r.pct_budget_spent) },
      { h: '% complete', num: 1, f: (r) => pct((D.earned_value.find((e) => e.project_id === r.project_id) || {}).actual_pct_complete) },
      { h: 'CPI', num: 1, f: (r) => num((D.earned_value.find((e) => e.project_id === r.project_id) || {}).cpi, 3) },
      { h: 'Cost status', f: (r) => pill((D.earned_value.find((e) => e.project_id === r.project_id) || {}).cost_status) }], bva);
  }

  function budget() {
    const bva = D.budget_vs_actual;
    chart('bvaChart', { type: 'bar', data: { labels: bva.map((r) => r.project_name), datasets: [
        { label: 'Approved budget', data: bva.map((r) => r.approved_budget), backgroundColor: NAVY },
        { label: 'Actual cost', data: bva.map((r) => r.actual_cost), backgroundColor: ORANGE }] },
      options: { scales: { y: moneyAxis, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ghs(c.raw)}` } } } } });
    const cats = D.cost_categories, rows = D.budget_by_category.filter(inProj);
    const agg = cats.map((c) => { const rr = rows.filter((r) => r.cost_category_code === c.code);
      return { name: c.name, b: rr.reduce((s, r) => s + n(r.budget_amount), 0), a: rr.reduce((s, r) => s + n(r.actual_cost), 0) }; });
    $('catHint').textContent = project === 'ALL' ? 'All projects' : pname(project);
    chart('catChart', { type: 'bar', data: { labels: agg.map((r) => r.name), datasets: [
        { label: 'Budget', data: agg.map((r) => r.b), backgroundColor: NAVY }, { label: 'Actual', data: agg.map((r) => r.a), backgroundColor: ORANGE }] },
      options: { indexAxis: 'y', scales: { x: moneyAxis, y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ghs(c.raw)}` } } } } });
    table('evmTable', [
      { h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'As of', k: 'as_of_week' },
      { h: 'Planned %', num: 1, f: (r) => pct(r.planned_pct_complete) }, { h: 'Actual %', num: 1, f: (r) => pct(r.actual_pct_complete) },
      { h: 'BAC', num: 1, f: (r) => ghs(r.bac) }, { h: 'AC', num: 1, f: (r) => ghs(r.ac) }, { h: 'EV', num: 1, f: (r) => ghs(r.ev) },
      { h: 'PV', num: 1, f: (r) => ghs(r.pv) },
      { h: 'CPI', num: 1, f: (r) => `<span class="${n(r.cpi) < 0.9 ? 'bad' : n(r.cpi) >= 0.97 ? 'good' : ''}">${num(r.cpi, 3)}</span>` },
      { h: 'SPI', num: 1, f: (r) => num(r.spi, 3) }, { h: 'EAC', num: 1, f: (r) => ghs(r.eac) },
      { h: 'VAC', num: 1, f: (r) => `<span class="${n(r.vac) < 0 ? 'bad' : 'good'}">${ghs(r.vac)}</span>` },
      { h: 'RAG', f: (r) => pill(r.cost_status) }], D.earned_value.filter(inProj));
    table('catTable', [{ h: 'Project', f: (r) => esc(pname(r.project_id)) }, { h: 'Category', k: 'cost_category_name' }, { h: 'Group', k: 'cost_group' },
      { h: 'Budget', num: 1, f: (r) => ghs(r.budget_amount) }, { h: 'Actual', num: 1, f: (r) => ghs(r.actual_cost) },
      { h: '% spent', num: 1, f: (r) => `<span class="${n(r.pct_spent) > 100 ? 'bad' : ''}">${pct(r.pct_spent)}</span>` }], rows);
  }

  function suppliers() {
    const sc = D.supplier_scorecard, sp = D.supplier_price;
    const worst = [...sc].sort((a, b) => n(a.overall_on_time_pct) - n(b.overall_on_time_pct))[0];
    const best = [...sc].sort((a, b) => n(b.overall_on_time_pct) - n(a.overall_on_time_pct))[0];
    const spend = sc.reduce((s, r) => s + n(r.spend), 0);
    cards('supplierCards', [
      { l: 'Materials suppliers', v: sc.length, note: ghsM(spend) + ' purchased', cls: 'navy' },
      { l: 'Lowest on-time rate', v: pct(worst.overall_on_time_pct), note: esc(worst.supplier_name), cls: 'red' },
      { l: 'Its price premium', v: `${pct(worst.min_pct_vs_cheapest)}–${pct(worst.max_pct_vs_cheapest)}`, note: 'Above the cheapest supplier per material', cls: 'red' },
      { l: 'Best on-time rate', v: pct(best.overall_on_time_pct), note: esc(best.supplier_name), cls: 'green' }]);
    chart('onTimeChart', { type: 'bar', data: { labels: sc.map((r) => r.supplier_name), datasets: [{ label: 'On-time %', data: sc.map((r) => r.overall_on_time_pct),
        backgroundColor: sc.map((r) => (n(r.overall_on_time_pct) < 50 ? '#d64545' : n(r.overall_on_time_pct) < 75 ? ORANGE : '#2e9d5b')) }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false } } } } });
    const mats = [...new Set(sp.map((r) => r.material_name))], sups = [...new Set(sp.map((r) => r.supplier_name))];
    chart('premiumChart', { type: 'bar', data: { labels: mats, datasets: sups.map((s, i) => ({ label: s, backgroundColor: PALETTE[i % PALETTE.length],
        data: mats.map((m) => { const r = sp.find((x) => x.material_name === m && x.supplier_name === s); return r ? 100 + n(r.pct_vs_cheapest) : null; }) })) },
      options: { scales: { y: { min: 96, max: 108, ticks: { callback: (v) => v } , title: { display: true, text: 'Price index (cheapest = 100)' } }, x: { grid: { display: false } } },
                 plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw === 100 ? 'cheapest' : '+' + (c.raw - 100).toFixed(1) + '% vs cheapest'}` } } } } });
    table('scoreTable', [{ h: 'Supplier', f: (r) => `<b>${esc(r.supplier_name)}</b>` }, { h: 'Materials', num: 1, k: 'materials' },
      { h: 'PO lines', num: 1, f: (r) => num(r.po_lines) }, { h: 'Spend', num: 1, f: (r) => ghs(r.spend) },
      { h: 'Premium vs cheapest', num: 1, f: (r) => `<span class="${n(r.max_pct_vs_cheapest) > 3 ? 'bad' : ''}">${n(r.min_pct_vs_cheapest) === n(r.max_pct_vs_cheapest) ? pct(r.max_pct_vs_cheapest) : pct(r.min_pct_vs_cheapest) + ' – ' + pct(r.max_pct_vs_cheapest)}</span>` },
      { h: 'On-time range', num: 1, f: (r) => (n(r.min_on_time_pct) === n(r.max_on_time_pct) ? pct(r.min_on_time_pct) : pct(r.min_on_time_pct) + ' – ' + pct(r.max_on_time_pct)) },
      { h: 'Overall on-time', num: 1, f: (r) => `<span class="${n(r.overall_on_time_pct) < 50 ? 'bad' : n(r.overall_on_time_pct) >= 75 ? 'good' : ''}">${pct(r.overall_on_time_pct)}</span>` }], sc);
    table('priceTable', [{ h: 'Material', f: (r) => `<b>${esc(r.material_name)}</b>` }, { h: 'Unit', k: 'standard_unit' }, { h: 'Supplier', k: 'supplier_name' },
      { h: 'PO lines', num: 1, k: 'po_lines' }, { h: 'Avg price / unit', num: 1, f: (r) => ghs(r.avg_unit_price, 2) },
      { h: 'Standard price', num: 1, f: (r) => ghs(r.standard_price_ghs, 2) }, { h: 'vs standard', num: 1, f: (r) => pct(r.pct_vs_standard) },
      { h: 'vs cheapest', num: 1, f: (r) => `<span class="${n(r.pct_vs_cheapest) > 3 ? 'bad' : n(r.pct_vs_cheapest) === 0 ? 'good' : ''}">${n(r.pct_vs_cheapest) === 0 ? 'Cheapest' : '+' + pct(r.pct_vs_cheapest)}</span>` },
      { h: 'On-time', num: 1, f: (r) => pct(r.on_time_pct) }, { h: 'Avg days late', num: 1, f: (r) => num(r.avg_days_late, 1) },
      { h: 'Spend', num: 1, f: (r) => ghs(r.spend) }], sp);
  }

  function labour() {
    const rows = D.labour_by_month.filter(inProj), months = [...new Set(rows.map((r) => r.m))].sort(), depts = [...new Set(D.labour_by_month.map((r) => r.d))].sort();
    const cost = rows.reduce((s, r) => s + n(r.cost), 0), hrs = rows.reduce((s, r) => s + n(r.hours), 0), ot = rows.reduce((s, r) => s + n(r.ot), 0);
    cards('labourCards', [{ l: 'Labour cost (payroll)', v: ghsM(cost), cls: 'navy' }, { l: 'Normal hours', v: num(hrs) }, { l: 'Overtime hours', v: num(ot), note: pct(100 * ot / (hrs + ot)) + ' of all hours' },
      { l: 'Average cost per hour', v: ghs(cost / (hrs + ot), 2), cls: 'navy' }]);
    $('labourHint').textContent = project === 'ALL' ? 'All projects' : pname(project);
    chart('labourChart', { type: 'bar', data: { labels: months, datasets: depts.map((d, i) => ({ label: d, backgroundColor: PALETTE[i % PALETTE.length],
        data: months.map((m) => rows.filter((r) => r.m === m && r.d === d).reduce((s, r) => s + n(r.cost), 0)) })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, moneyAxis) }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ghs(c.raw)}` } } } } });
    chart('hoursChart', { type: 'line', data: { labels: months, datasets: [
        { label: 'Normal hours', data: months.map((m) => rows.filter((r) => r.m === m).reduce((s, r) => s + n(r.hours), 0)), borderColor: NAVY, backgroundColor: 'rgba(31,42,68,.12)', fill: true, tension: .3, pointRadius: 0 },
        { label: 'Overtime hours', data: months.map((m) => rows.filter((r) => r.m === m).reduce((s, r) => s + n(r.ot), 0)), borderColor: ORANGE, backgroundColor: 'rgba(242,140,40,.15)', fill: true, tension: .3, pointRadius: 0 }] },
      options: { scales: { x: { grid: { display: false } } } } });
    table('roleTable', [{ h: 'Department', k: 'department' }, { h: 'Job title', k: 'job_title' }, { h: 'Headcount', num: 1, k: 'headcount' },
      { h: 'Hours', num: 1, f: (r) => num(r.hours) }, { h: 'Overtime', num: 1, f: (r) => num(r.overtime_hours) }, { h: 'Labour cost', num: 1, f: (r) => ghs(r.labour_cost_ghs) }], D.labour_by_role);
  }

  function clients() {
    const c = D.cost_by_client;
    chart('clientChart', { type: 'doughnut', data: { labels: c.map((r) => r.client_name), datasets: [{ data: c.map((r) => r.actual_cost), backgroundColor: PALETTE }] },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (x) => `${x.label}: ${ghs(x.raw)}` } } } } });
    table('clientTable', [{ h: 'Client', f: (r) => `<b>${esc(r.client_name)}</b>` }, { h: 'Type', k: 'client_type' }, { h: 'Region', k: 'region' },
      { h: 'Budget', num: 1, f: (r) => ghs(r.approved_budget) }, { h: 'Actual', num: 1, f: (r) => ghs(r.actual_cost) },
      { h: '% spent', num: 1, f: (r) => pct(100 * n(r.actual_cost) / n(r.approved_budget)) }], c);
    table('clientProjTable', [{ h: 'Client', k: 'client_name' }, { h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'Type', k: 'project_type' },
      { h: 'Region', k: 'region' }, { h: 'Contract value', num: 1, f: (r) => ghs(r.contract_value_ghs) }, { h: 'Status', k: 'current_status' }],
      [...D.projects].sort((a, b) => String(a.client_name).localeCompare(b.client_name)));
  }

  function dq() {
    const s = D.dq_summary;
    cards('dqCards', [{ l: 'Raw source rows', v: num(s.raw_rows), note: 'Latest ETL run #' + s.run_id, cls: 'navy' },
      { l: 'Duplicates removed', v: num(s.duplicates_removed), cls: 'red' }, { l: 'IDs recovered', v: num(s.ids_recovered), note: 'Missing keys repaired from other fields' },
      { l: 'Rows rejected', v: num(s.rows_rejected), note: 'Logged with reason', cls: 'red' },
      { l: 'Reconciliations', v: `${s.reconciliations_pass}/${s.reconciliations_total}`, note: 'Warehouse = cleansed source', cls: 'green' }]);
    table('srcTable', [{ h: 'Source', k: 'source' }, { h: 'Raw', num: 1, f: (r) => num(r.raw_rows) }, { h: 'Duplicates', num: 1, f: (r) => num(r.duplicates_removed) },
      { h: 'IDs recovered', num: 1, f: (r) => num(r.ids_recovered) }, { h: 'Rejected', num: 1, f: (r) => num(r.rejected) }, { h: 'Clean', num: 1, f: (r) => num(r.clean_rows) }], D.dq_source_counts);
    table('reconTable', [{ h: 'Check', k: 'check' }, { h: 'Expected', num: 1, f: (r) => ghs(r.expected, 2) }, { h: 'Actual', num: 1, f: (r) => ghs(r.actual, 2) },
      { h: 'Difference', num: 1, f: (r) => ghs(r.difference, 2) }, { h: 'Status', f: (r) => pill(r.status) }], D.reconciliation);
    table('rulesTable', [{ h: 'Rule', f: (r) => `<b>${esc(r.rule)}</b>` }, { h: 'Source', k: 'source' }, { h: 'What it does', k: 'name' }, { h: 'Rows', num: 1, f: (r) => num(r.rows) },
      { h: 'Example before', f: (r) => `<code>${esc(r.before)}</code>` }, { h: 'Example after', f: (r) => `<code>${esc(r.after)}</code>` }], D.dq_rules);
    table('runTable', [{ h: 'Run', k: 'run_id' }, { h: 'Started', f: (r) => fmtTime(r.started_at) },
      { h: 'Duration', num: 1, f: (r) => ((new Date(r.finished_at) - new Date(r.started_at)) / 1000).toFixed(1) + ' s' }, { h: 'Status', f: (r) => pill(r.status) }, { h: 'Notes', k: 'notes' }], D.etl_runs);
    const names = { GL: 'General ledger', PO: 'Purchase orders', PAYROLL: 'Payroll timesheets', BUDGET: 'Approved budgets' };
    table('loadTable', [{ h: 'Fact rows from', f: (r) => names[r.record_source] || esc(r.record_source) }, { h: 'Rows', num: 1, f: (r) => num(r.rows_in_star) },
      { h: 'Source total', num: 1, f: (r) => ghs(r.source_total, 2) }, { h: 'Warehouse total', num: 1, f: (r) => ghs(r.star_total, 2) }, { h: 'Status', f: (r) => pill(r.status) }], D.star_load_check);
  }

  function star() {
    const c = D.star_counts, desc = { fact_project_cost: 'Fact: one row per project cost transaction', dim_date: 'Calendar (also expected / actual delivery date)',
      dim_project: 'Projects (SCD Type 2)', dim_client: 'Clients', dim_supplier: 'Suppliers', dim_material: 'Materials', dim_cost_category: 'Cost categories', dim_employee: 'Employees (SCD Type 2)' };
    table('countTable', [{ h: 'Table', f: (r) => `<b>${esc(r.t)}</b>` }, { h: 'Role', k: 'd' }, { h: 'Rows', num: 1, f: (r) => num(r.n) }],
      Object.keys(desc).map((t) => ({ t, d: desc[t], n: c[t] })));
  }

  const PAGES = { overview, budget, suppliers, labour, clients, dq, star };
  let current = 'overview';
  function show(page) {
    current = page;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.id !== 'page-' + page));
    $('projectFilter').parentElement.style.visibility = ['overview', 'budget', 'labour'].includes(page) ? 'visible' : 'hidden';
    PAGES[page]();
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  }

  async function load() {
    $('error').classList.add('hidden'); $('loading').classList.remove('hidden');
    try {
      const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      D = await r.json();
      const sel = $('projectFilter');
      sel.innerHTML = '<option value="ALL">All projects</option>' + D.projects.map((p) => `<option value="${esc(p.project_id)}">${esc(p.project_name)}</option>`).join('');
      sel.value = project;
      $('loading').classList.add('hidden');
      const live = D._source !== 'snapshot';
      $('sourceBadge').className = 'badge' + (live ? '' : ' snap');
      $('footerText').textContent = (live ? 'Live data from the cloud warehouse (PostgreSQL on Supabase)' : 'Offline copy of the warehouse data (live connection unavailable)') +
        ' · queried ' + fmtTime(D.generated_at) + ' · synthetic demonstration data for coursework.';
      const h = location.hash.slice(1); show(PAGES[h] ? h : 'overview');
    } catch (e) {
      $('loading').classList.add('hidden');
      $('error').innerHTML = 'Could not load the warehouse data (' + esc(e.message) + '). <button id="retry">Retry</button>';
      $('error').classList.remove('hidden'); $('retry').onclick = load;
    }
  }

  Chart.defaults.font.family = '"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif';
  Chart.defaults.color = '#4a5470'; Chart.defaults.transitions.resize = { animation: { duration: 0 } };
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => D && show(b.dataset.page)));
  $('projectFilter').onchange = (e) => { project = e.target.value; if (D) show(current); };
  load();
})();
