/* Rockshell ledger dashboard. Reads GET /api/data (already limited to the ledger star).
   Synthetic coursework page. Does not invent figures when the response is empty or failed. */
(() => {
  const NAVY = '#1f3a5f';
  const BUDGET = '#c5ccd6';
  const TEXT = '#1c2430';
  const MUTED = '#5c6570';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let charts = {};
  let DATA = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ghs = (v) => {
    const x = Number(v);
    const body = Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (x < 0 ? '-' : '') + 'GH₵' + body;
  };
  const when = (t) => {
    if (!t) return 'time not provided';
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? 'time not provided' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  };

  function table(id, columns, rows) {
    const el = $(id);
    const caption = el.querySelector('caption');
    if (!rows.length) {
      el.innerHTML = (caption ? caption.outerHTML : '') + '<tbody><tr><td>No rows.</td></tr></tbody>';
      return;
    }
    const head = '<tr>' + columns.map((c) => `<th class="${c.num ? 'num' : ''}" scope="col">${esc(c.h)}</th>`).join('') + '</tr>';
    const body = rows.map((r) => '<tr>' + columns.map((c) => `<td class="${c.num ? 'num' : ''}">${esc(c.f ? c.f(r) : r[c.k])}</td>`).join('') + '</tr>').join('');
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
        },
      },
      grid: { color: '#eef0f3' },
      border: { display: false },
    };
  }

  function chart(id, label, cfg) {
    const canvas = $(id);
    canvas.setAttribute('aria-label', label);
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduce ? 0 : 300 },
      plugins: { legend: { display: false } },
    }, cfg.options || {});
    charts[id] = new Chart(canvas, cfg);
  }

  function sumCategories(rows) {
    const map = new Map();
    for (const row of rows) {
      const key = row.category_id || row.category_name;
      const add = Math.round(Number(row.actual_cost_ghs) * 100);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { category_id: row.category_id, category_name: row.category_name, project_id: null, cents: add });
      } else {
        prev.cents += add;
      }
    }
    return [...map.values()].map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name,
      project_id: null,
      actual_cost_ghs: row.cents / 100,
    }));
  }

  function selection() {
    const id = $('projectFilter').value;
    const projects = id ? DATA.projects.filter((p) => p.project_id === id) : DATA.projects.slice();
    const sum = (key) => Math.round(projects.reduce((total, row) => total + Math.round(Number(row[key]) * 100), 0)) / 100;
    const totals = projects.length ? {
      approved_budget_ghs: sum('approved_budget_ghs'),
      actual_cost_ghs: sum('actual_cost_ghs'),
      remaining_budget_ghs: sum('remaining_budget_ghs'),
    } : null;
    let categories = null;
    let categoryNote = '';
    if (DATA.categories_status === 'ready' && Array.isArray(DATA.categories)) {
      const scoped = DATA.categories.some((c) => c.project_id);
      if (!id && scoped) {
        categories = sumCategories(DATA.categories);
        categoryNote = 'Category amounts are added across projects. Each project budget is still counted once.';
      } else if (!id) {
        categories = DATA.categories.slice();
      } else if (scoped) {
        categories = DATA.categories.filter((c) => c.project_id === id);
        categoryNote = 'Category amounts for the selected project.';
      } else {
        categories = DATA.categories.slice();
        categoryNote = 'These category amounts cover the whole ledger. This response does not split them by project.';
      }
    }
    return { projects, totals, categories, categoryNote };
  }

  function render() {
    const view = selection();
    const incomplete = Array.isArray(DATA.incomplete) ? DATA.incomplete : [];
    $('incomplete').classList.toggle('hidden', incomplete.length === 0);
    $('incomplete').textContent = incomplete.length
      ? incomplete.length + ' row(s) were left out of the totals because a project id, budget, or ledger amount was missing or repeated.'
      : '';

    const hasProjects = view.projects.length > 0 && view.totals;
    $('empty').classList.toggle('hidden', DATA.projects.length > 0);
    $('budgetFig').textContent = hasProjects ? ghs(view.totals.approved_budget_ghs) : '';
    $('ledgerFig').textContent = hasProjects ? ghs(view.totals.actual_cost_ghs) : '';
    $('remainFig').textContent = hasProjects ? ghs(view.totals.remaining_budget_ghs) : '';
    const share = hasProjects && view.totals.approved_budget_ghs
      ? (Math.round((view.totals.actual_cost_ghs * 1000) / view.totals.approved_budget_ghs) / 10).toFixed(1) + '%'
      : '';
    $('budgetNote').textContent = hasProjects
      ? view.projects.length + (view.projects.length === 1 ? ' project. Counted once.' : ' projects. Each budget is counted once.')
      : '';
    $('spendNote').textContent = hasProjects
      ? 'fact_project_cost only. ' + share + ' of the approved budget. Not percent complete.'
      : 'fact_project_cost only.';

    const zeros = view.projects.filter((p) => Number(p.actual_cost_ghs) === 0);
    $('budgetCaption').textContent = hasProjects
      ? 'Grey is the approved budget. Navy is recorded spending.'
        + (zeros.length ? ' ' + zeros.length + ' project(s) have recorded spending of 0 and are still shown.' : '')
        + ' Axis labels are rounded. The table has the exact cedis.'
      : 'No project rows to chart.';
    const canvas = $('budgetChart');
    if (hasProjects) {
      canvas.classList.remove('hidden');
      chart('budgetChart', $('budgetTitle').textContent, {
        type: 'bar',
        data: {
          labels: view.projects.map((p) => p.project_id),
          datasets: [
            { label: 'Approved budget', data: view.projects.map((p) => p.approved_budget_ghs), backgroundColor: BUDGET, barPercentage: 0.9, categoryPercentage: 0.8 },
            { label: 'Recorded spending', data: view.projects.map((p) => p.actual_cost_ghs), backgroundColor: NAVY, barPercentage: 0.9, categoryPercentage: 0.8 },
          ],
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: axisMoney(),
            y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 13, weight: '600' } } },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + ghs(c.parsed.x) } },
          },
        },
      });
    } else if (charts.budgetChart) {
      charts.budgetChart.destroy();
      delete charts.budgetChart;
      canvas.classList.add('hidden');
    } else {
      canvas.classList.add('hidden');
    }
    table('budgetTable', [
      { h: 'Project', f: (r) => r.project_id + ' ' + r.project_name },
      { h: 'Approved budget', num: true, f: (r) => ghs(r.approved_budget_ghs) },
      { h: 'Recorded spending', num: true, f: (r) => ghs(r.actual_cost_ghs) },
      { h: 'Remaining', num: true, f: (r) => ghs(r.remaining_budget_ghs) },
      { h: 'Share of budget', num: true, f: (r) => (r.pct_budget_used === null || r.pct_budget_used === undefined ? '' : r.pct_budget_used.toFixed(1) + '%') },
      { h: 'Expense lines', num: true, f: (r) => (r.expense_lines === null || r.expense_lines === undefined ? '' : String(r.expense_lines)) },
    ], view.projects);

    const catCanvas = $('categoryChart');
    if (view.categories && view.categories.length) {
      catCanvas.classList.remove('hidden');
      $('categoryEmpty').classList.add('hidden');
      const unassigned = Number(DATA.unassigned_category_ghs) || 0;
      $('categoryCaption').textContent = (view.categoryNote ? view.categoryNote + ' ' : '')
        + 'Amounts are ledger spending by cost category.'
        + (unassigned ? ' ' + ghs(unassigned) + ' has no cost category and is not in this chart.' : '');
      chart('categoryChart', 'Spending by cost category', {
        type: 'bar',
        data: {
          labels: view.categories.map((c) => c.category_name),
          datasets: [{ data: view.categories.map((c) => c.actual_cost_ghs), backgroundColor: NAVY, barPercentage: 0.72 }],
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: axisMoney(),
            y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 12 } } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + ghs(c.parsed.x) } } },
        },
      });
    } else {
      if (charts.categoryChart) charts.categoryChart.destroy();
      delete charts.categoryChart;
      catCanvas.classList.add('hidden');
      $('categoryEmpty').classList.remove('hidden');
      $('categoryEmpty').textContent = DATA.categories_status === 'ready'
        ? 'No category rows for this selection.'
        : 'Cost category spending is not in this response yet.';
      $('categoryCaption').textContent = 'The page will show category bars when the ledger response includes them. No stand-in figures are used.';
    }
    table('categoryTable', [
      { h: 'Category', k: 'category_name' },
      { h: 'Project', f: (r) => r.project_id || 'All projects' },
      { h: 'Recorded spending', num: true, f: (r) => ghs(r.actual_cost_ghs) },
      { h: 'Expense lines', num: true, f: (r) => (r.expense_lines === null || r.expense_lines === undefined ? '' : String(r.expense_lines)) },
    ], view.categories || []);

    const months = Array.isArray(DATA.monthly) ? DATA.monthly : [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (months.length) {
      $('monthChart').classList.remove('hidden');
      $('monthEmpty').classList.add('hidden');
      chart('monthChart', 'Recorded spending by month', {
        type: 'bar',
        data: {
          labels: months.map((m) => monthNames[m.month - 1] || String(m.month)),
          datasets: [{ data: months.map((m) => m.actual_cost_ghs), backgroundColor: NAVY, barPercentage: 0.7 }],
        },
        options: {
          scales: {
            y: axisMoney(),
            x: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + ghs(c.parsed.y) } } },
        },
      });
    } else {
      if (charts.monthChart) charts.monthChart.destroy();
      delete charts.monthChart;
      $('monthChart').classList.add('hidden');
      $('monthEmpty').classList.remove('hidden');
    }

    const counts = DATA.table_counts;
    $('countLine').textContent = counts
      ? 'Rows: projects ' + (counts.dim_project ?? '') + ', dates ' + (counts.dim_date ?? '') + ', cost categories ' + (counts.dim_cost_category ?? '') + ', expense lines ' + (counts.fact_project_cost ?? '') + '.'
      : 'Row counts were not in this response.';
    const checks = DATA.quality_checks && typeof DATA.quality_checks === 'object'
      ? Object.entries(DATA.quality_checks).map(([name, value]) => ({ name, value: String(value) }))
      : [];
    table('qualityTable', [
      { h: 'Check', k: 'name' },
      { h: 'Value', k: 'value' },
    ], checks);

    const live = DATA._source === 'live';
    $('footer').textContent = (live
      ? 'Live figures from the warehouse function. Generated ' + when(DATA.generated_at) + '.'
      : 'Review fixture, not a live warehouse call.')
      + ' Synthetic coursework data. Recorded spending is fact_project_cost only.';
  }

  function fillFilter() {
    const select = $('projectFilter');
    const current = select.value;
    select.innerHTML = '<option value="">All projects</option>' + DATA.projects.map((p) => `<option value="${esc(p.project_id)}">${esc(p.project_id + ' ' + p.project_name)}</option>`).join('');
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  async function load() {
    $('error').classList.add('hidden');
    $('loading').classList.remove('hidden');
    $('content').classList.add('hidden');
    $('main').setAttribute('aria-busy', 'true');
    try {
      const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.error || !Array.isArray(data.projects)) {
        const detail = data && data.detail ? data.detail : ('HTTP ' + r.status);
        throw new Error(detail);
      }
      DATA = data;
      $('loading').classList.add('hidden');
      $('content').classList.remove('hidden');
      fillFilter();
      render();
    } catch (e) {
      $('loading').classList.add('hidden');
      $('content').classList.add('hidden');
      $('error').innerHTML = 'The ledger figures could not be loaded (' + esc(e.message) + '). Nothing else is shown in their place. <button type="button" id="retry">Try again</button>';
      $('error').classList.remove('hidden');
      $('retry').addEventListener('click', load);
      $('retry').focus();
      $('footer').textContent = '';
    } finally {
      $('main').setAttribute('aria-busy', 'false');
    }
  }

  $('projectFilter').addEventListener('change', () => { if (DATA) render(); });
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.color = MUTED;
  load();
})();
