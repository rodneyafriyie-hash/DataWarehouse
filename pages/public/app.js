/* Rockshell International Ltd. Data Warehouse - dashboard (Coursework 4 constellation, simple report style). Reads /api/data. */
(() => {
  const NAVY = '#1f2a44', ORANGE = '#e07b1f', GREY = '#aab2bf', TEXT = '#252a34';
  let D = null, charts = {}, current = 'overview';

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

  const top = (arr, k) => [...arr].sort((a, b) => n(b[k]) - n(a[k]));
  const ordinalMonth = (m) => new Date(2025, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });

  /* ---------------- Overview ---------------- */
  function overview() {
    const T = D.totals, P = D.projects, loaded = D.etl.reduce((s, r) => s + n(r.loaded_rows), 0), rej = D.etl.reduce((s, r) => s + n(r.rejected_rows), 0);
    const pass = D.validation.filter((v) => v.status === 'PASS').length;
    cards('ovCards', [
      { l: 'Approved budget', v: ghsM(T.approved_budget_ghs), note: `${P.length} projects (Dim_Project)` },
      { l: 'Ledger cost', v: ghsM(T.ledger_cost_ghs), note: `${pct(100 * T.ledger_cost_ghs / T.approved_budget_ghs, 1)} of the approved budget` },
      { l: 'Fact rows loaded', v: num(loaded), note: 'Across 4 fact tables' },
      { l: 'Rows rejected', v: num(rej), alert: rej > 0, note: 'Invalid or duplicate, logged with a reason' },
      { l: 'Validation checks', v: `${pass} of ${D.validation.length}`, note: 'Counts and foreign keys match validation.json' }]);
    const s = top(P, 'ledger_cost_ghs'), t = s[0];
    $('ovLedgerTitle').textContent = `${t.project_id} has the highest ledger cost (${ghs(t.ledger_cost_ghs, 2)})`;
    chart('ovLedgerChart', hbar(s.map((r) => r.project_id), s.map((r) => n(r.ledger_cost_ghs)), s.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => ghsM(v), {}, { left: 0, right: 60 }));
    const L = D.monthly.filter((r) => r.subject === 'Ledger cost').sort((a, b) => a.month - b.month);
    const pk = top(L, 'amount_ghs')[0];
    $('ovTrendTitle').textContent = `Ledger spending peaked in ${ordinalMonth(pk.month)} 2025 at ${ghsM(pk.amount_ghs)}`;
    chart('ovTrendChart', { type: 'line', data: { labels: L.map((r) => ordinalMonth(r.month)), datasets: [{ data: L.map((r) => n(r.amount_ghs)), borderColor: NAVY, backgroundColor: NAVY, borderWidth: 2, pointRadius: 3, tension: 0.25 }] },
      options: { scales: { x: { grid: { display: false }, ticks: { color: '#6b7280' } }, y: { beginAtZero: true, grid: { color: '#eef0f3' }, border: { display: false }, ticks: { maxTicksLimit: 5, color: '#6b7280', callback: (v) => ghsM(v, 0) } } },
        plugins: { tooltip: { callbacks: { label: (c) => ghs(c.raw, 2) } } } } });
    const cnt = D.table_counts;
    table('ovSubjects', [{ h: 'Subject', f: (r) => `<b>${r.s}</b>` }, { h: 'Fact table', k: 'f' }, { h: 'One row represents', k: 'g' }, { h: 'Rows', num: 1, f: (r) => num(cnt[r.f]) }, { h: 'Total', num: 1, f: (r) => ghs(r.v, 2) }], [
      { s: 'Project cost', f: 'fact_project_cost', g: 'One ledger cost transaction', v: T.ledger_cost_ghs },
      { s: 'Procurement', f: 'fact_procurement', g: 'One purchase line', v: T.procurement_ghs },
      { s: 'Material usage', f: 'fact_material_usage', g: 'One site material-usage entry', v: T.material_usage_ghs },
      { s: 'Labour', f: 'fact_labor', g: 'One employee work entry for one project/date', v: T.labour_ghs }]);
  }

  /* ---------------- Projects ---------------- */
  function projects() {
    const P = D.projects.map((r) => Object.assign({ used: 100 * n(r.ledger_cost_ghs) / n(r.approved_budget_ghs) }, r));
    const s = top(P, 'used'), hi = s[0], first3 = D.projects.slice(0, 3).map((r) => r.project_id);
    cards('prCards', D.projects.slice(0, 3).map((r, i) => ({ l: `#${i + 1} ledger cost: ${esc(r.project_id)}`, v: ghs(r.ledger_cost_ghs, 2),
      note: `Budget ${ghs(r.approved_budget_ghs, 2)} · remaining ${ghs(r.budget_less_ledger_cost_ghs, 2)}` }))
      .concat([{ l: 'Highest share of budget used', v: pct(hi.used), alert: true, note: `${esc(hi.project_id)}: ${ghs(hi.ledger_cost_ghs, 2)} of ${ghs(hi.approved_budget_ghs, 2)}` }]));
    $('prUseTitle').textContent = `${hi.project_id} has used ${pct(hi.used)} of its budget; most projects are under 25%`;
    chart('prUseChart', hbar(s.map((r) => `${r.project_id} · ${r.location}`), s.map((r) => r.used), s.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => pct(v), { max: 100 }));
    table('prTable', [{ h: 'Project', f: (r) => `<b class="${first3.includes(r.project_id) ? 'hl' : ''}">${esc(r.project_id)}</b>` }, { h: 'Name', k: 'project_name' }, { h: 'Type', k: 'project_type' },
      { h: 'Location', k: 'location' }, { h: 'Client', k: 'client_name' }, { h: 'Approved budget', num: 1, f: (r) => ghs(r.approved_budget_ghs, 2) },
      { h: 'Ledger cost', num: 1, f: (r) => ghs(r.ledger_cost_ghs, 2) }, { h: 'Budget less ledger cost', num: 1, f: (r) => ghs(r.budget_less_ledger_cost_ghs, 2) },
      { h: 'Ledger lines', num: 1, k: 'ledger_lines' }], D.projects);
  }

  /* ---------------- Procurement ---------------- */
  function procurement() {
    const S = D.suppliers, t = S[0], tot = n(D.totals.procurement_ghs), lines = S.reduce((s, r) => s + n(r.purchase_lines), 0);
    cards('pcCards', [{ l: 'Purchase cost', v: ghsM(tot), note: `${num(lines)} purchase lines` }, { l: 'Suppliers', v: S.length, note: 'Dim_Supplier' },
      { l: 'Largest supplier', v: ghsM(t.purchase_total_ghs), note: `${esc(t.supplier_name)} (${pct(100 * t.purchase_total_ghs / tot)} of purchases)` },
      { l: 'Average line', v: ghs(tot / lines, 2), note: 'Purchase cost per line' }]);
    $('pcTitle').textContent = `${t.supplier_name} received the most purchase value (${ghs(t.purchase_total_ghs, 2)})`;
    chart('pcChart', hbar(S.map((r) => r.supplier_name.replace('Synthetic ', '')), S.map((r) => n(r.purchase_total_ghs)), S.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => ghsM(v)));
    table('pcTable', [{ h: 'Rank', f: (r) => S.indexOf(r) + 1 }, { h: 'Supplier', f: (r) => `<b>${esc(r.supplier_name)}</b>` }, { h: 'Purchase lines', num: 1, k: 'purchase_lines' },
      { h: 'Purchase total', num: 1, f: (r) => ghs(r.purchase_total_ghs, 2) }, { h: 'Share', num: 1, f: (r) => pct(100 * r.purchase_total_ghs / tot) }], S);
  }

  /* ---------------- Labour ---------------- */
  function labour() {
    const L = D.labour, t = L[0], T = D.totals;
    cards('lbCards', [{ l: 'Labour cost', v: ghsM(T.labour_ghs), note: `${num(D.table_counts.fact_labor)} work entries` }, { l: 'Hours worked', v: num(T.labour_hours), note: '40 employees (Dim_Employee)' },
      { l: 'Average cost per hour', v: ghs(T.labour_ghs / T.labour_hours, 2), note: 'Labour cost ÷ hours' },
      { l: 'Highest labour cost', v: ghs(t.labor_cost_ghs, 2), note: `${esc(t.project_name)}, ${num(t.hours)} hours` }]);
    $('lbTitle').textContent = `${t.project_name} has the highest labour cost (${ghs(t.labor_cost_ghs, 2)})`;
    chart('lbChart', hbar(L.map((r) => r.project_id), L.map((r) => n(r.labor_cost_ghs)), L.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => ghsM(v)));
    table('lbTable', [{ h: 'Project', f: (r) => `<b>${esc(r.project_name)}</b>` }, { h: 'Entries', num: 1, k: 'entries' }, { h: 'Hours', num: 1, f: (r) => num(r.hours) },
      { h: 'Labour cost', num: 1, f: (r) => ghs(r.labor_cost_ghs, 2) }, { h: 'Cost per hour', num: 1, f: (r) => ghs(r.labor_cost_ghs / r.hours, 2) }], L);
  }

  /* ---------------- Material usage ---------------- */
  function materials() {
    const M = D.materials, t = M[0], tot = n(D.totals.material_usage_ghs);
    cards('muCards', [{ l: 'Material usage cost', v: ghsM(tot), note: `${num(D.table_counts.fact_material_usage)} site usage entries` }, { l: 'Materials', v: M.length, note: 'Each with one canonical unit' },
      { l: 'Costliest material', v: ghsM(t.usage_cost_ghs), note: `${esc(t.material_name)}: ${num(t.quantity_used)} ${esc(t.unit)}s used` }]);
    $('muTitle').textContent = `${t.material_name} accounts for the most usage cost (${ghs(t.usage_cost_ghs, 2)})`;
    chart('muChart', hbar(M.map((r) => r.material_name), M.map((r) => n(r.usage_cost_ghs)), M.map((r, i) => (i === 0 ? ORANGE : NAVY)), (v) => ghsM(v)));
    table('muTable', [{ h: 'Material', f: (r) => `<b>${esc(r.material_name)}</b>` }, { h: 'Unit', k: 'unit' }, { h: 'Quantity used', num: 1, f: (r) => num(r.quantity_used) },
      { h: 'Entries', num: 1, k: 'entries' }, { h: 'Usage cost', num: 1, f: (r) => ghs(r.usage_cost_ghs, 2) }], M);
  }

  /* ---------------- Data quality ---------------- */
  function dq() {
    const E = D.etl, raw = E.reduce((s, r) => s + n(r.raw_rows), 0), ld = E.reduce((s, r) => s + n(r.loaded_rows), 0), rj = E.reduce((s, r) => s + n(r.rejected_rows), 0);
    const pass = D.validation.filter((v) => v.status === 'PASS').length, fkv = D.validation.find((v) => v.check_name === 'foreign_key_violations');
    cards('dqCards', [{ l: 'Rows read', v: num(raw), note: 'From 4 raw fact files' }, { l: 'Rows loaded', v: num(ld), note: 'Into the 4 fact tables' },
      { l: 'Rows rejected', v: num(rj), alert: rj > 0, note: '3 per source: duplicate, bad reference, bad value' },
      { l: 'Foreign-key violations', v: num(fkv ? fkv.actual : 0), note: 'Every fact row links to a dimension row' },
      { l: 'Validation checks', v: `${pass} of ${D.validation.length}`, note: 'Passed' }]);
    table('dqLoadTable', [{ h: 'Source file', k: 'source_file' }, { h: 'Fact table', k: 'fact_table' }, { h: 'Read', num: 1, k: 'raw_rows' }, { h: 'Loaded', num: 1, k: 'loaded_rows' }, { h: 'Rejected', num: 1, k: 'rejected_rows' }], E);
    $('valTitle').textContent = pass === D.validation.length ? 'All validation checks pass' : `${D.validation.length - pass} validation checks fail`;
    const nm = (c) => c === 'total_raw_rejected' ? 'Rejected rows' : c === 'foreign_key_violations' ? 'Foreign-key violations' : 'Rows in ' + c.replace('rows_', '');
    table('valTable', [{ h: 'Check', f: (r) => nm(r.check_name) }, { h: 'Expected', num: 1, f: (r) => num(r.expected) }, { h: 'Actual', num: 1, f: (r) => num(r.actual) }, { h: 'Result', f: (r) => status(r.status) }], D.validation);
    table('rejTable', [{ h: 'Source file', k: 'source_file' }, { h: 'Record ID', f: (r) => `<b>${esc(r.source_identifier)}</b>` }, { h: 'Reason', wrap: 1, k: 'rejection_reason' }], D.rejected);
  }

  /* ---------------- Schema ---------------- */
  function schema() {
    const c = D.table_counts, desc = { fact_project_cost: 'Fact: one ledger cost transaction', fact_procurement: 'Fact: one purchase line', fact_material_usage: 'Fact: one site material-usage entry',
      fact_labor: 'Fact: one employee work entry for one project/date', dim_project: 'Project, type, location, client link, approved budget', dim_date: 'Day, month, quarter, year',
      dim_supplier: 'Supplier IDs and names', dim_material: 'Material names and canonical units', dim_employee: 'Employee roles (synthetic names)', dim_cost_category: 'Expense categories', dim_client: 'Clients (via Dim_Project)' };
    table('countTable', [{ h: 'Table', f: (r) => `<b>${esc(r.t)}</b>` }, { h: 'Holds', k: 'd' }, { h: 'Rows', num: 1, f: (r) => num(r.n) }], Object.keys(desc).map((t) => ({ t, d: desc[t], n: c[t] })));
    table('grainTable', [{ h: 'Fact table', f: (r) => `<b>${r.f}</b>` }, { h: 'Dimensions', wrap: 1, k: 'd' }, { h: 'Measures', wrap: 1, k: 'm' }], [
      { f: 'Fact_Project_Cost', d: 'Project, Date, Cost Category', m: 'Actual_Cost_GHS' },
      { f: 'Fact_Procurement', d: 'Project, Date, Supplier, Material', m: 'Quantity, Unit_Price_GHS, Purchase_Cost_GHS' },
      { f: 'Fact_Material_Usage', d: 'Project, Date, Material', m: 'Quantity_Used, Unit_Cost_GHS, Total_Material_Cost_GHS' },
      { f: 'Fact_Labor', d: 'Project, Date, Employee', m: 'Hours_Worked, Hourly_Rate_GHS, Labor_Cost_GHS' }]);
  }

  const PAGES = { overview, projects, procurement, labour, materials, dq, schema };
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
      $('loading').classList.add('hidden');
      $('asof').textContent = 'Coursework 4 data · transactions dated 2025';
      $('footer').textContent = (D._source !== 'snapshot' ? 'Live data from the cloud data warehouse (PostgreSQL on Supabase)' : 'Offline copy of the warehouse data (live connection unavailable)') +
        ' · refreshed ' + fmtTime(D.generated_at) + ' · synthetic academic prototype data (Coursework 4)';
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
  load();
})();
