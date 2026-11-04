/* Rockshell International Ltd. Data Warehouse - dashboard (v2, simple report style). Reads /api/data. */
(() => {
  const NAVY = '#1f2a44', ORANGE = '#e07b1f', GREY = '#aab2bf', TEXT = '#252a34';
  let D = null, charts = {}, project = 'ALL', current = 'overview';

  const $ = (id) => document.getElementById(id);
  const n = (v) => (v === null || v === undefined ? 0 : Number(v));
  const sign = (x) => (x < 0 ? '−' : '');
  const ghs = (v, d = 0) => sign(n(v)) + 'GH₵' + Math.abs(n(v)).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ghsM = (v, d = 2) => { const x = n(v), a = Math.abs(x); return a >= 1e6 ? sign(x) + 'GH₵' + (a / 1e6).toFixed(d) + 'M' : a >= 1e3 ? sign(x) + 'GH₵' + (a / 1e3).toFixed(0) + 'K' : ghs(x); };
  const num = (v, d = 0) => n(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => (v === null || v === undefined ? '–' : n(v).toFixed(d) + '%');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const status = (s) => `<span class="dot ${esc(s)}"></span>${esc(s === 'PASS' ? 'Pass' : s === 'FAIL' ? 'Fail' : s === 'SUCCESS' ? 'Success' : s)}`;
  const pname = (id) => (D.projects.find((p) => p.project_id === id) || {}).project_name || id;
  const evOf = (id) => D.earned_value.find((e) => e.project_id === id) || {};
  const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const fmtTime = (t) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  const monthName = (ym) => { const [y, m] = ym.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
  const shortSup = (s) => s.replace(/ (Ltd|Co|Factory|Hardware)$/,'').replace(' Building Materials', '');

  function table(el, cols, rows) {
    const head = '<tr>' + cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('') + '</tr>';
    const body = rows.map((r) => '<tr>' + cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('') + '</tr>').join('');
    $(el).innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  }
  function cards(el, items) {
    $(el).innerHTML = items.map((c) => `<div class="card"><div class="label">${c.l}</div><div class="value ${c.alert ? 'alert' : ''}">${c.v}</div><div class="note">${c.note || '&nbsp;'}</div></div>`).join('');
  }

  // Direct data labels at the end of each bar (no legends needed)
  const labels = {
    id: 'labels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.fmt) return;
      const { ctx } = chart, horiz = chart.options.indexAxis === 'y';
      ctx.save(); ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = TEXT;
      chart.data.datasets.forEach((ds, i) => chart.getDatasetMeta(i).data.forEach((el, j) => {
        const v = ds.data[j]; if (v === null || v === undefined) return;
        const t = opts.fmt(v, j);
        if (horiz) { ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(t, Math.max(el.x, el.base) + 6, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(t, el.x, el.y - 4); }
      }));
      ctx.restore();
    },
  };
  function chart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    cfg.plugins = [labels];
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: Object.assign({ legend: { display: false } }, (cfg.options || {}).plugins || {}) }, cfg.options || {}, { plugins: Object.assign({ legend: { display: false } }, (cfg.options || {}).plugins || {}) });
    charts[id] = new Chart($(id), cfg);
  }
  const hbar = (labelsArr, data, colors, fmt, xopts = {}, pad = { left: 0, right: 70 }) => ({
    type: 'bar',
    data: { labels: labelsArr, datasets: [{ data, backgroundColor: colors, borderRadius: 2, barPercentage: 0.7, categoryPercentage: 0.85 }] },
    options: { indexAxis: 'y', layout: { padding: pad },
      scales: { x: Object.assign({ display: false, beginAtZero: true }, xopts), y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 12 } } } },
      plugins: { labels: { fmt }, tooltip: { enabled: false } } },
  });

  /* ---------------- Overview ---------------- */
  function overview() {
    const ev = D.earned_value, bva = D.budget_vs_actual;
    const budget = bva.reduce((s, r) => s + n(r.approved_budget), 0), actual = bva.reduce((s, r) => s + n(r.actual_cost), 0);
    const overrun = ev.reduce((s, r) => s + Math.max(-n(r.vac), 0), 0);
    const red = ev.filter((r) => r.cost_status === 'Red'), worst = [...ev].sort((a, b) => n(a.cpi) - n(b.cpi))[0];
    const dq = D.dq_summary;
    cards('ovCards', [
      { l: 'Approved budget', v: ghsM(budget), note: `Latest approved budgets for ${bva.length} projects` },
      { l: 'Spent to date', v: ghsM(actual), note: `${pct(100 * actual / budget, 0)} of the approved budget` },
      { l: 'Forecast overrun', v: ghsM(overrun), alert: overrun > 0, note: `Mostly ${esc(worst.project_name)} (${ghsM(-worst.vac)})` },
      { l: 'Projects at risk', v: red.length, alert: red.length > 0, note: red.map((r) => `${esc(r.project_name)}: CPI ${num(r.cpi, 3)}`).join(', ') || 'None' },
      { l: 'Data checks passed', v: `${dq.reconciliations_pass} of ${dq.reconciliations_total}`, note: 'Warehouse totals match the source systems' }]);

    const sorted = [...ev].sort((a, b) => n(a.cpi) - n(b.cpi));
    $('cpiTitle').textContent = `${worst.project_name} earns only GH₵${num(worst.cpi, 2)} of work per GH₵1 spent`;
    chart('cpiChart', hbar(sorted.map((r) => r.project_name), sorted.map((r) => n(r.cpi)),
      sorted.map((r) => (r.cost_status === 'Red' ? ORANGE : NAVY)), (v) => 'GH₵' + v.toFixed(2), { max: 1.15 }));

    const months = [...new Set(D.monthly_spend.map((r) => r.m))].sort();
    const tot = months.map((m) => D.monthly_spend.filter((r) => r.m === m).reduce((s, r) => s + n(r.v), 0));
    const last = tot[tot.length - 1], first12 = tot.slice(-24, -12).reduce((a, b) => a + b, 0), last12 = tot.slice(-12).reduce((a, b) => a + b, 0);
    $('trendTitle').textContent = `Monthly spending reached ${ghsM(last)} in ${monthName(months[months.length - 1])}` +
      (first12 ? ` (${last12 >= first12 ? 'up' : 'down'} ${pct(Math.abs(100 * (last12 / first12 - 1)), 0)} on the year before)` : '');
    chart('trendChart', { type: 'line', data: { labels: months.map(monthName), datasets: [{ data: tot, borderColor: NAVY, backgroundColor: NAVY, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25 }] },
      options: { layout: { padding: { right: 8 } }, interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: '#6b7280', maxRotation: 0 } },
                  y: { beginAtZero: true, grid: { color: '#eef0f3' }, border: { display: false }, ticks: { maxTicksLimit: 5, color: '#6b7280', callback: (v) => ghsM(v, 1) } } },
        plugins: { tooltip: { callbacks: { label: (c) => ghs(c.raw) } } } } });

    table('ovTable', [
      { h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'Client', k: 'client_name' }, { h: 'Manager', k: 'current_manager' },
      { h: 'Budget', num: 1, f: (r) => ghs(r.approved_budget) }, { h: 'Spent to date', num: 1, f: (r) => ghs(r.actual_cost) },
      { h: 'Complete', num: 1, f: (r) => pct(evOf(r.project_id).actual_pct_complete, 0) },
      { h: 'Forecast final cost', num: 1, f: (r) => ghs(evOf(r.project_id).eac) },
      { h: 'Status', f: (r) => status(evOf(r.project_id).cost_status) }], bva);
  }

  /* ---------------- Projects ---------------- */
  function projects() {
    const ev = D.earned_value, sel = project === 'ALL' ? null : evOf(project);
    if (!sel) {
      const bac = ev.reduce((s, r) => s + n(r.bac), 0), ac = ev.reduce((s, r) => s + n(r.ac), 0), eac = ev.reduce((s, r) => s + n(r.eac), 0);
      const lab = D.labour_by_month.reduce((s, r) => s + n(r.cost), 0), hrs = D.labour_by_month.reduce((s, r) => s + n(r.hours), 0), ot = D.labour_by_month.reduce((s, r) => s + n(r.ot), 0);
      cards('prCards', [
        { l: 'Budget at completion', v: ghsM(bac), note: 'All projects' }, { l: 'Spent to date', v: ghsM(ac), note: pct(100 * ac / bac, 0) + ' of budget' },
        { l: 'Forecast final cost', v: ghsM(eac), alert: eac > bac, note: `Net ${ghsM(Math.abs(eac - bac))} ${eac > bac ? 'over' : 'under'} budget across all projects` },
        { l: 'Labour cost', v: ghsM(lab), note: `${pct(100 * ot / (hrs + ot))} of hours were overtime` }]);
    } else {
      cards('prCards', [
        { l: 'Budget at completion', v: ghsM(sel.bac), note: esc(sel.project_name) },
        { l: 'Spent to date', v: ghsM(sel.ac), note: `${pct(sel.actual_pct_complete, 0)} of the work complete` },
        { l: 'Cost performance (CPI)', v: num(sel.cpi, 3), alert: sel.cost_status === 'Red', note: `GH₵${num(sel.cpi, 2)} of work per GH₵1 spent · ${status(sel.cost_status)}` },
        { l: 'Forecast final cost', v: ghsM(sel.eac), alert: n(sel.vac) < 0, note: `${ghsM(Math.abs(sel.vac))} ${n(sel.vac) < 0 ? 'over' : 'under'} budget` }]);
    }
    const byOver = [...ev].sort((a, b) => n(a.vac) - n(b.vac)), top = byOver[0];
    $('vacTitle').textContent = `${top.project_name} is forecast to finish ${ghsM(-top.vac)} over budget`;
    chart('vacChart', hbar(byOver.map((r) => r.project_name), byOver.map((r) => -n(r.vac)),
      byOver.map((r) => (r.cost_status === 'Red' ? ORANGE : sel && r.project_id !== sel.project_id ? GREY : NAVY)),
      (v) => (v >= 0 ? '+' + ghsM(v) + ' over' : ghsM(-v) + ' under'), {}, { left: 0, right: 120 }));

    const rows = D.budget_by_category.filter((r) => !sel || r.project_id === sel.project_id);
    const cats = D.cost_categories.map((c) => { const rr = rows.filter((r) => r.cost_category_code === c.code);
      const b = rr.reduce((s, r) => s + n(r.budget_amount), 0), a = rr.reduce((s, r) => s + n(r.actual_cost), 0); return { name: c.name, p: b ? 100 * a / b : 0 }; })
      .sort((x, y) => y.p - x.p);
    const over = cats.filter((c) => c.p > 100);
    $('catTitle').textContent = over.length ? `${over.map((c) => c.name).join(' and ')} ${over.length > 1 ? 'are' : 'is'} over budget (${over.map((c) => pct(c.p)).join(', ')})`
      : `No cost category is over budget yet (highest: ${cats[0].name}, ${pct(cats[0].p, 0)})`;
    $('catHint').textContent = `Actual cost as a share of the approved budget for each category · ${sel ? sel.project_name : 'all projects'}`;
    chart('catChart', hbar(cats.map((c) => c.name), cats.map((c) => c.p), cats.map((c) => (c.p > 100 ? ORANGE : NAVY)), (v) => pct(v, 0), { max: 125 }));

    table('evmTable', [
      { h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'Status', f: (r) => status(r.cost_status) },
      { h: 'Complete', num: 1, f: (r) => pct(r.actual_pct_complete, 0) }, { h: 'Planned', num: 1, f: (r) => pct(r.planned_pct_complete, 0) },
      { h: 'Budget (BAC)', num: 1, f: (r) => ghs(r.bac) }, { h: 'Spent (AC)', num: 1, f: (r) => ghs(r.ac) }, { h: 'Earned (EV)', num: 1, f: (r) => ghs(r.ev) },
      { h: 'CPI', num: 1, f: (r) => `<span class="${r.cost_status === 'Red' ? 'hl' : ''}">${num(r.cpi, 3)}</span>` }, { h: 'SPI', num: 1, f: (r) => num(r.spi, 3) },
      { h: 'Forecast final cost (EAC)', num: 1, f: (r) => ghs(r.eac) },
      { h: 'Over / (under) budget', num: 1, f: (r) => `<span class="${n(r.vac) < -100000 ? 'hl' : ''}">${n(r.vac) < 0 ? ghs(-r.vac) : '(' + ghs(r.vac) + ')'}</span>` }],
      sel ? [sel] : ev);
  }

  /* ---------------- Suppliers ---------------- */
  function suppliers() {
    const sc = D.supplier_scorecard, sp = D.supplier_price;
    const worst = [...sc].sort((a, b) => n(a.overall_on_time_pct) - n(b.overall_on_time_pct))[0];
    const best = [...sc].sort((a, b) => n(b.overall_on_time_pct) - n(a.overall_on_time_pct))[0];
    const spend = sc.reduce((s, r) => s + n(r.spend), 0), lines = sc.reduce((s, r) => s + n(r.po_lines), 0);
    const wShort = shortSup(worst.supplier_name);
    const prem = `${num(worst.min_pct_vs_cheapest, 1)}–${num(worst.max_pct_vs_cheapest, 1)}%`;
    cards('spCards', [
      { l: `${esc(worst.supplier_name)}: on time`, v: pct(worst.overall_on_time_pct), alert: true, note: `Lowest of ${sc.length} materials suppliers` },
      { l: `${esc(worst.supplier_name)}: price premium`, v: prem, alert: true, note: `Above the cheapest supplier on all ${worst.materials} materials it sells` },
      { l: 'Most reliable supplier', v: pct(best.overall_on_time_pct), note: `${esc(best.supplier_name)}, delivered on time` },
      { l: 'Materials purchased', v: ghsM(spend), note: `${num(lines)} purchase-order lines` }]);
    const s2 = [...sc].sort((a, b) => n(b.overall_on_time_pct) - n(a.overall_on_time_pct));
    $('onTimeTitle').textContent = `${wShort} delivers on time only ${pct(worst.overall_on_time_pct, 0)} of the time`;
    chart('onTimeChart', hbar(s2.map((r) => shortSup(r.supplier_name)), s2.map((r) => n(r.overall_on_time_pct)),
      s2.map((r) => (r.supplier_id === worst.supplier_id ? ORANGE : NAVY)), (v) => pct(v), { max: 110 }));
    const pairs = sp.filter((r) => n(r.pct_vs_cheapest) > 0).sort((a, b) => n(b.pct_vs_cheapest) - n(a.pct_vs_cheapest));
    $('premTitle').textContent = `${wShort} charges ${prem} more than the cheapest supplier`;
    chart('premChart', hbar(pairs.map((r) => `${r.material_name.replace(/ \(.*\)| 6in/g, '')} · ${shortSup(r.supplier_name)}`), pairs.map((r) => n(r.pct_vs_cheapest)),
      pairs.map((r) => (r.supplier_id === worst.supplier_id ? ORANGE : GREY)), (v) => '+' + pct(v), { max: 8 }));
    table('scoreTable', [{ h: 'Supplier', f: (r) => `<b>${esc(r.supplier_name)}</b>` }, { h: 'Materials', num: 1, k: 'materials' },
      { h: 'Purchase lines', num: 1, f: (r) => num(r.po_lines) }, { h: 'Spend', num: 1, f: (r) => ghs(r.spend) },
      { h: 'On time', num: 1, f: (r) => `<span class="${r.supplier_id === worst.supplier_id ? 'hl' : ''}">${pct(r.overall_on_time_pct)}</span>` },
      { h: 'Price vs cheapest', num: 1, f: (r) => (n(r.max_pct_vs_cheapest) === 0 ? 'Cheapest' : n(r.min_pct_vs_cheapest) === n(r.max_pct_vs_cheapest) ? '+' + pct(r.max_pct_vs_cheapest)
          : `<span class="${r.supplier_id === worst.supplier_id ? 'hl' : ''}">${n(r.min_pct_vs_cheapest) === 0 ? 'Cheapest to +' + pct(r.max_pct_vs_cheapest) : '+' + pct(r.min_pct_vs_cheapest) + ' to +' + pct(r.max_pct_vs_cheapest)}</span>`) }], sc);
  }

  /* ---------------- Data quality ---------------- */
  function dq() {
    const s = D.dq_summary;
    cards('dqCards', [
      { l: 'Rows received', v: num(s.raw_rows), note: `From 12 data sources, load #${s.run_id}` },
      { l: 'Duplicates removed', v: num(s.duplicates_removed), note: 'Repeated records dropped' },
      { l: 'IDs recovered', v: num(s.ids_recovered), note: 'Missing keys filled from other fields' },
      { l: 'Rows rejected', v: num(s.rows_rejected), note: 'Unusable rows, logged with a reason' },
      { l: 'Totals reconciled', v: `${s.reconciliations_pass} of ${s.reconciliations_total}`, note: 'Warehouse equals the cleaned source' }]);
    const nice = { payroll: 'Payroll', accounting_gl: 'General ledger', procurement_po: 'Purchase orders', site_progress: 'Site reports', client_invoices: 'Invoices',
      hr_employees: 'HR', project_budgets: 'Budgets', project_register: 'Projects', supplier_master: 'Suppliers', material_master: 'Materials', clients: 'Clients', site_material: 'Site material use' };
    const src = D.dq_source_counts.map((r) => ({ name: nice[r.source] || r.source, v: n(r.duplicates_removed) + n(r.ids_recovered) + n(r.rejected) }))
      .filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    $('dqTitle').textContent = `${src[0].name} needed the most cleaning (${num(src[0].v)} rows)`;
    chart('dqChart', hbar(src.map((r) => r.name), src.map((r) => r.v), src.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => num(v)));
    const label = (c) => ({ GL: 'General ledger', Procurement: 'Purchase orders', Payroll: 'Payroll', Invoices: 'Client invoices', Budgets: 'Budgets' }[c.split(':')[0]] || c.split(':')[0]);
    table('reconTable', [{ h: 'Source', f: (r) => label(r.check) }, { h: 'Warehouse total', num: 1, f: (r) => ghs(r.actual) },
      { h: 'Difference', num: 1, f: (r) => ghs(r.difference) }, { h: 'Result', f: (r) => status(r.status) }], D.reconciliation.filter((r) => r.status !== 'INFO'));
    const ruleName = { R1: 'Standardise supplier and vendor names', R2: 'Convert quantities to standard units', R3: 'Fix mixed date formats',
      R4: 'Remove duplicate records', R5: 'Recover missing project and employee IDs', R6: 'Validate values and reject bad rows', R7: 'Turn money and percent text into numbers',
      SCD2: 'Keep history of role and manager changes' };
    const groups = {};
    D.dq_rules.forEach((r) => { const g = groups[r.rule] || (groups[r.rule] = { rule: r.rule, sources: new Set(), rows: 0 }); g.sources.add(nice[r.source] || r.source); g.rows += n(r.rows); });
    table('rulesTable', [{ h: 'Rule', k: 'rule' }, { h: 'What it does', f: (r) => esc(ruleName[r.rule] || r.rule) },
      { h: 'Applied to', wrap: 1, f: (r) => esc([...r.sources].join(', ')) }, { h: 'Rows affected', num: 1, f: (r) => num(r.rows) }],
      Object.values(groups).sort((a, b) => (a.rule === 'SCD2') - (b.rule === 'SCD2') || a.rule.localeCompare(b.rule)));
    table('runTable', [{ h: 'Load', f: (r) => '#' + r.run_id }, { h: 'Started', f: (r) => fmtTime(r.started_at) },
      { h: 'Duration', num: 1, f: (r) => ((new Date(r.finished_at) - new Date(r.started_at)) / 1000).toFixed(1) + ' s' }, { h: 'Result', f: (r) => status(r.status) }], D.etl_runs);
  }

  /* ---------------- Star schema ---------------- */
  function star() {
    const c = D.star_counts, desc = { fact_project_cost: 'Fact: one row per project cost transaction', dim_date: 'Calendar', dim_project: 'Projects (with history)',
      dim_client: 'Clients', dim_supplier: 'Suppliers', dim_material: 'Materials', dim_cost_category: 'Cost categories', dim_employee: 'Employees (with history)' };
    table('countTable', [{ h: 'Table', f: (r) => `<b>${esc(r.t)}</b>` }, { h: 'Holds', k: 'd' }, { h: 'Rows', num: 1, f: (r) => num(r.n) }],
      Object.keys(desc).map((t) => ({ t, d: desc[t], n: c[t] })));
  }

  const PAGES = { overview, projects, suppliers, dq, star };
  function show(page) {
    current = page;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.id !== 'page-' + page));
    PAGES[page]();
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  }

  async function load() {
    $('error').classList.add('hidden'); $('loading').classList.remove('hidden');
    try {
      const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      D = await r.json();
      $('projectFilter').innerHTML = '<option value="ALL">All projects</option>' + D.projects.map((p) => `<option value="${esc(p.project_id)}">${esc(p.project_name)}</option>`).join('');
      $('projectFilter').value = project;
      $('loading').classList.add('hidden');
      const asof = D.earned_value.map((e) => e.as_of_week).sort().pop();
      $('asof').textContent = 'Progress as at ' + fmtDate(asof);
      $('footer').textContent = (D._source !== 'snapshot' ? 'Live data from the cloud data warehouse (PostgreSQL on Supabase)' : 'Offline copy of the warehouse data (live connection unavailable)') +
        ' · refreshed ' + fmtTime(D.generated_at) + ' · synthetic data prepared for coursework';
      const h = location.hash.slice(1); show(PAGES[h] ? h : 'overview');
    } catch (e) {
      $('loading').classList.add('hidden');
      $('error').innerHTML = 'The warehouse data could not be loaded (' + esc(e.message) + '). <button id="retry">Try again</button>';
      $('error').classList.remove('hidden'); $('retry').onclick = load;
    }
  }

  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.color = '#6b7280';
  Chart.defaults.transitions.resize = { animation: { duration: 0 } };
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => D && show(b.dataset.page)));
  $('projectFilter').onchange = (e) => { project = e.target.value; if (D) show(current); };
  load();
})();
