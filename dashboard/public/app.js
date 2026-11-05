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

  function render() {
    const P = D.projects.map((r) => Object.assign({ used: 100 * n(r.ledger_cost_ghs) / n(r.approved_budget_ghs) }, r)).sort((a, b) => b.used - a.used);
    const T = D.totals, hi = P[0], second = P[1];
    const loaded = D.etl.reduce((s, r) => s + n(r.loaded_rows), 0), rej = D.etl.reduce((s, r) => s + n(r.rejected_rows), 0);
    cards('cards', [
      { l: 'Total budget', v: ghsM(T.approved_budget_ghs), note: `${P.length} projects` },
      { l: 'Total spent', v: ghsM(T.ledger_cost_ghs), note: `${pct(100 * T.ledger_cost_ghs / T.approved_budget_ghs, 1)} of the budget` },
      { l: 'Rows loaded', v: num(loaded), note: 'Clean records in the warehouse' },
      { l: 'Rows rejected', v: num(rej), alert: rej > 0, note: 'Bad or duplicate records removed' }]);
    $('bvsTitle').textContent = `${hi.project_id} has already spent ${pct(hi.used, 1)} of its budget; every other project is under ${Math.ceil(second.used / 10) * 10}%`;
    const bvsLabels = { id: 'bvsLabels', afterDatasetsDraw(c) {
      const ctx = c.ctx; ctx.save(); ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      c.getDatasetMeta(0).data.forEach((el, j) => { ctx.fillStyle = '#6b7280'; ctx.fillText(`${ghsM(P[j].approved_budget_ghs)} budget`, el.x + 6, el.y); });
      c.getDatasetMeta(1).data.forEach((el, j) => { ctx.fillStyle = j === 0 ? ORANGE : TEXT; ctx.fillText(`${ghsM(P[j].ledger_cost_ghs)} spent (${pct(P[j].used, 1)})`, el.x + 6, el.y); });
      ctx.restore(); } };
    if (charts.bvsChart) charts.bvsChart.destroy();
    charts.bvsChart = new Chart($('bvsChart'), { type: 'bar', plugins: [bvsLabels], data: { labels: P.map((r) => r.project_id), datasets: [
        { data: P.map((r) => n(r.approved_budget_ghs)), backgroundColor: '#d5d9e0', barPercentage: 0.92, categoryPercentage: 0.82 },
        { data: P.map((r) => n(r.ledger_cost_ghs)), backgroundColor: P.map((r, i) => (i === 0 ? ORANGE : NAVY)), barPercentage: 0.92, categoryPercentage: 0.82 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: 'y', layout: { padding: { left: 0, right: 150 } },
        scales: { x: { display: false, beginAtZero: true }, y: { grid: { display: false }, border: { display: false }, ticks: { color: TEXT, font: { size: 14, weight: '600' } } } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
    const S = D.suppliers.slice(0, 5), all = n(T.procurement_ghs);
    $('supTitle').textContent = `Spending is spread evenly: the biggest supplier gets only ${pct(100 * S[0].purchase_total_ghs / all, 1)} of purchases (GH₵${num(S[0].purchase_total_ghs)})`;
    chart('supChart', hbar(S.map((r) => r.supplier_name.replace('Synthetic ', '')), S.map((r) => n(r.purchase_total_ghs)), S.map(() => NAVY), (v) => ghsM(v)));
    const pass = D.validation.filter((v) => v.status === 'PASS').length;
    $('checks').innerHTML = `${status(pass === D.validation.length ? 'PASS' : 'FAIL').replace(/Pass|Fail/, '')}<b>Data checks: ${pass} of ${D.validation.length} passed</b> <span class="hint">(row counts and links match the source build)</span>`;
    $('footer').textContent = (D._source !== 'snapshot' ? 'Live data from the cloud data warehouse' : 'Offline copy (live connection unavailable)') + ' · refreshed ' + fmtTime(D.generated_at);
  }

  async function load() {
    $('error').classList.add('hidden'); $('loading').classList.remove('hidden');
    try {
      const r = await fetch('/api/data', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      D = await r.json();
      $('loading').classList.add('hidden'); $('content').classList.remove('hidden');
      render();
    } catch (e) {
      $('loading').classList.add('hidden');
      $('error').innerHTML = 'The data could not be loaded (' + esc(e.message) + '). <button id="retry">Try again</button>';
      $('error').classList.remove('hidden'); $('retry').onclick = load;
    }
  }

  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.color = '#6b7280';
  Chart.defaults.transitions.resize = { animation: { duration: 0 } };
  load();
})();
