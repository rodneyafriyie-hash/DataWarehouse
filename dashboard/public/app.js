/* Rockshell coursework dashboard. One page. Reads GET /api/data.
   Four money subjects stay separate. Material quantities are never totalled. */
(() => {
  const NAVY = '#1f3a5f';
  const BUDGET = '#c5ccd6';
  const TEXT = '#1c2430';
  const MUTED = '#5c6570';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let charts = {};

  const $ = (id) => document.getElementById(id);
  const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
  const list = (v) => (Array.isArray(v) ? v : []);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ghs = (v) => {
    const x = n(v);
    const body = Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (x < 0 ? '-' : '') + 'GH₵' + body;
  };
  const num = (v, d = 0) => n(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v) => n(v).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const when = (t) => {
    if (!t) return 'unknown time';
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? 'unknown time' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  };

  function table(id, columns, rows) {
    const el = $(id);
    if (!rows.length) {
      el.innerHTML = '<tbody><tr><td>No rows.</td></tr></tbody>';
      return;
    }
    const head = '<tr>' + columns.map((c) => `<th class="${c.num ? 'num' : ''}" scope="col">${esc(c.h)}</th>`).join('') + '</tr>';
    const body = rows.map((r) => '<tr>' + columns.map((c) => {
      const val = c.f ? c.f(r) : r[c.k];
      return `<td class="${c.num ? 'num' : ''}">${c.raw ? val : esc(val)}</td>`;
    }).join('') + '</tr>').join('');
    const caption = el.querySelector('caption');
    el.innerHTML = (caption ? caption.outerHTML : '') + `<thead>${head}</thead><tbody>${body}</tbody>`;
  }

  function axisMoney() {
    return {
      beginAtZero: true,
      ticks: {
        color: MUTED,
        maxTicksLimit: 5,
        callback: (v) => {
          const x = Number(v);
          if (Math.abs(x) >= 1e6) return 'GH₵' + (x / 1e6).toFixed(1) + 'm';
          if (Math.abs(x) >= 1e3) return 'GH₵' + Math.round(x / 1e3) + 'k';
          return 'GH₵' + x;
        }
      },
      grid: { color: '#eef0f3' },
      border: { display: false }
    };
  }

  function chart(id, label, cfg) {
    const canvas = $(id);
    canvas.setAttribute('aria-label', label);
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduce ? 0 : 350 },
      plugins: { legend: { display: false } }
    }, cfg.options || {});
    charts[id] = new Chart(canvas, cfg);
  }

  function hbar(id, label, labels, data) {
    chart(id, label, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: NAVY, borderRadius: 2, barPercentage: 0.72 }] },
      options: {
        indexAxis: 'y',
        scales: {
          x: axisMoney(),
          y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 12 } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ' ' + ghs(c.parsed.x) } }
        }
      }
    });
  }

  function render(D) {
    const T = D.totals || {};
    const projects = list(D.projects).map((r) => {
      const budget = n(r.approved_budget_ghs);
      const spent = n(r.ledger_cost_ghs);
      return Object.assign({}, r, { budget, spent, share: budget ? (100 * spent) / budget : 0 });
    });
    const bySpent = projects.slice().sort((a, b) => b.spent - a.spent);
    const byShare = projects.slice().sort((a, b) => b.share - a.share);
    const suppliers = list(D.suppliers).slice().sort((a, b) => n(b.purchase_total_ghs) - n(a.purchase_total_ghs));
    const labour = list(D.labour).slice().sort((a, b) => n(b.labor_cost_ghs) - n(a.labor_cost_ghs));
    const materials = list(D.materials).slice().sort((a, b) => n(b.usage_cost_ghs) - n(a.usage_cost_ghs));
    const units = [...new Set(materials.map((m) => m.unit).filter(Boolean))].sort();

    $('budgetFig').textContent = ghs(T.approved_budget_ghs);
    $('budgetNote').textContent = projects.length + ' projects. This is the only figure to compare with recorded spending.';
    $('ledgerFig').textContent = ghs(T.ledger_cost_ghs);
    const shareAll = n(T.approved_budget_ghs) ? (100 * n(T.ledger_cost_ghs)) / n(T.approved_budget_ghs) : 0;
    $('ledgerNote').textContent = pct(shareAll) + ' of the approved budget, from fact_project_cost.';
    $('buyFig').textContent = ghs(T.procurement_ghs);
    $('matFig').textContent = ghs(T.material_usage_ghs);
    $('matNote').textContent = units.length
      ? 'Cost in cedis. ' + units.length + ' units are not added together.'
      : 'Cost in cedis only.';
    $('labFig').textContent = ghs(T.labour_ghs);
    $('labNote').textContent = num(T.labour_hours, 0) + ' hours, kept separate from this cost and from the ledger.';

    const topSpent = bySpent[0];
    const topShare = byShare[0];
    const over = projects.filter((p) => p.spent > p.budget);
    if (topSpent && topShare) {
      $('budgetTitle').textContent = topSpent.project_id + ' has the largest ledger amount. ' + topShare.project_id + ' has used the largest share of its own budget.';
      $('budgetCaption').textContent = topSpent.project_id + ' recorded ' + ghs(topSpent.spent) + ' of a ' + ghs(topSpent.budget) + ' budget. '
        + topShare.project_id + ' has used ' + pct(topShare.share) + '. '
        + (over.length ? over.length + ' project(s) are over budget.' : 'No project is over its approved budget.')
        + ' Axis labels are rounded. The table has the exact cedis.';
      $('budgetChart').classList.remove('hidden');
      $('budgetEmpty').classList.add('hidden');
      chart('budgetChart', $('budgetTitle').textContent, {
        type: 'bar',
        data: {
          labels: bySpent.map((p) => p.project_id),
          datasets: [
            { label: 'Approved budget', data: bySpent.map((p) => p.budget), backgroundColor: BUDGET, barPercentage: 0.9, categoryPercentage: 0.8 },
            { label: 'Recorded ledger spending', data: bySpent.map((p) => p.spent), backgroundColor: NAVY, barPercentage: 0.9, categoryPercentage: 0.8 }
          ]
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: axisMoney(),
            y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 13, weight: '600' } } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + ghs(c.parsed.x) } }
          }
        }
      });
    } else {
      $('budgetTitle').textContent = 'Budget and recorded spending';
      $('budgetCaption').textContent = 'No project rows were returned.';
      $('budgetChart').classList.add('hidden');
      $('budgetEmpty').classList.remove('hidden');
    }
    table('budgetTable', [
      { h: 'Project', f: (r) => r.project_id + ' ' + r.project_name },
      { h: 'Place', k: 'location' },
      { h: 'Approved budget', num: true, f: (r) => ghs(r.budget) },
      { h: 'Recorded spending', num: true, f: (r) => ghs(r.spent) },
      { h: 'Budget minus ledger', num: true, f: (r) => ghs(r.budget_less_ledger_cost_ghs) },
      { h: 'Share of budget', num: true, f: (r) => pct(r.share) }
    ], bySpent);

    const buyTop = suppliers[0];
    $('buyCaption').textContent = suppliers.length
      ? 'Largest purchase total is ' + buyTop.supplier_name.replace(/^Synthetic /, '') + ' at ' + ghs(buyTop.purchase_total_ghs)
        + ' (' + pct(n(T.procurement_ghs) ? (100 * n(buyTop.purchase_total_ghs)) / n(T.procurement_ghs) : 0) + ' of purchases). Showing 5 of ' + suppliers.length + '.'
      : 'No purchase rows were returned.';
    if (suppliers.length) {
      const top5 = suppliers.slice(0, 5);
      $('buyChart').classList.remove('hidden');
      $('buyEmpty').classList.add('hidden');
      hbar('buyChart', $('buyCaption').textContent, top5.map((r) => r.supplier_name.replace(/^Synthetic /, '')), top5.map((r) => n(r.purchase_total_ghs)));
    } else {
      $('buyChart').classList.add('hidden');
      $('buyEmpty').classList.remove('hidden');
    }
    table('buyTable', [
      { h: 'Supplier', k: 'supplier_name' },
      { h: 'Purchase cost', num: true, f: (r) => ghs(r.purchase_total_ghs) },
      { h: 'Lines', num: true, k: 'purchase_lines' }
    ], suppliers);

    const labTop = labour[0];
    $('labCaption').textContent = labour.length
      ? 'Highest labour cost is ' + labTop.project_id + ' at ' + ghs(labTop.labor_cost_ghs) + ' (' + num(labTop.hours, 0) + ' hours). This is not ledger spending.'
      : 'No labour rows were returned.';
    if (labour.length) {
      const topL = labour.slice(0, 5);
      $('labChart').classList.remove('hidden');
      $('labEmpty').classList.add('hidden');
      hbar('labChart', $('labCaption').textContent, topL.map((r) => r.project_id), topL.map((r) => n(r.labor_cost_ghs)));
    } else {
      $('labChart').classList.add('hidden');
      $('labEmpty').classList.remove('hidden');
    }
    table('labTable', [
      { h: 'Project', f: (r) => r.project_id + ' ' + r.project_name },
      { h: 'Hours', num: true, f: (r) => num(r.hours, 2) },
      { h: 'Labour cost', num: true, f: (r) => ghs(r.labor_cost_ghs) },
      { h: 'Entries', num: true, k: 'entries' }
    ], labour);

    $('matCaption').textContent = materials.length
      ? 'Each bar is cost in cedis, not a quantity. ' + (materials[0].material_name) + ' is the largest cost at ' + ghs(materials[0].usage_cost_ghs)
        + ' (' + num(materials[0].quantity_used, 0) + ' ' + materials[0].unit + '). There is no total quantity.'
      : 'No material rows were returned.';
    if (materials.length) {
      $('matChart').classList.remove('hidden');
      $('matEmpty').classList.add('hidden');
      hbar('matChart', $('matCaption').textContent, materials.map((r) => r.material_name + ' (' + r.unit + ')'), materials.map((r) => n(r.usage_cost_ghs)));
    } else {
      $('matChart').classList.add('hidden');
      $('matEmpty').classList.remove('hidden');
    }
    table('matTable', [
      { h: 'Material', k: 'material_name' },
      { h: 'Unit', k: 'unit' },
      { h: 'Quantity in that unit', num: true, f: (r) => num(r.quantity_used, 2) },
      { h: 'Cost', num: true, f: (r) => ghs(r.usage_cost_ghs) },
      { h: 'Entries', num: true, k: 'entries' }
    ], materials);

    const etl = list(D.etl);
    const rejected = list(D.rejected);
    const validation = list(D.validation);
    const pass = validation.filter((v) => v.status === 'PASS').length;
    $('etlIntro').textContent = etl.length
      ? 'Each source file lost 3 rows to the cleaning rules. ' + rejected.length + ' rows were rejected in total. Loaded facts: '
        + etl.map((r) => r.fact_table.replace('fact_', '') + ' ' + num(r.loaded_rows)).join(', ') + '.'
      : 'No load statistics were returned.';
    table('etlTable', [
      { h: 'Fact', k: 'fact_table' },
      { h: 'Source file', k: 'source_file' },
      { h: 'Raw rows', num: true, k: 'raw_rows' },
      { h: 'Loaded', num: true, k: 'loaded_rows' },
      { h: 'Rejected', num: true, k: 'rejected_rows' }
    ], etl);
    $('checkLine').textContent = validation.length
      ? 'Validation: ' + pass + ' of ' + validation.length + ' checks passed (row counts, rejected rows, and foreign keys).'
      : 'No validation checks were returned.';
    table('rejectTable', [
      { h: 'Source file', k: 'source_file' },
      { h: 'Source id', k: 'source_identifier' },
      { h: 'Reason', k: 'rejection_reason' }
    ], rejected);

    const live = D._source !== 'snapshot';
    $('footer').textContent = (live ? 'Live figures from the hosted PostgreSQL warehouse.' : 'Offline copy, because the live warehouse did not respond.')
      + ' Refreshed ' + when(D.generated_at) + '. Synthetic coursework data.';
  }

  async function load() {
    $('error').classList.add('hidden');
    $('loading').classList.remove('hidden');
    $('main').setAttribute('aria-busy', 'true');
    try {
      const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!data || typeof data !== 'object') throw new Error('The response was not a warehouse payload');
      $('loading').classList.add('hidden');
      $('content').classList.remove('hidden');
      render(data);
    } catch (e) {
      $('loading').classList.add('hidden');
      $('content').classList.add('hidden');
      $('error').innerHTML = 'The warehouse figures could not be loaded (' + esc(e.message) + '). <button type="button" id="retry">Try again</button>';
      $('error').classList.remove('hidden');
      $('retry').addEventListener('click', load);
      $('retry').focus();
    } finally {
      $('main').setAttribute('aria-busy', 'false');
    }
  }

  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.color = MUTED;
  load();
})();
