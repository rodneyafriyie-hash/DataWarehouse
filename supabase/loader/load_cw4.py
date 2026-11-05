"""Rockshell Coursework 4 -> Supabase (PostgreSQL) loader.
Re-applies build_warehouse.py's validation rules to coursework4/raw_data/*.csv and writes SQL
that loads the exact same rows into schema rockshell. Asserts the result equals the Coursework 4
SQLite build (rockshell_warehouse.sqlite) and outputs/validation.json before writing anything."""
import csv, json, sqlite3
from datetime import date, timedelta
from pathlib import Path
H = Path(__file__).resolve().parent; CW = H.parent.parent / 'coursework4'; RAW = CW / 'raw_data'
def read(n):
    with open(RAW / n, encoding='utf-8', newline='') as f: return list(csv.DictReader(f))
def q(v):
    if v is None: return 'null'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"
ins = lambda t, cols, rows: f"insert into rockshell.{t} ({','.join(cols)}) values\n" + ',\n'.join('(' + ','.join(q(x) for x in r) + ')' for r in rows) + ';\n' if rows else ''
out = []
# dimensions: surrogate keys assigned in file order, as SQLite INTEGER PRIMARY KEY does
dims = {}
for t, f, cols in [('dim_client', 'clients.csv', ['client_id', 'client_name']), ('dim_supplier', 'suppliers.csv', ['supplier_id', 'supplier_name']),
                   ('dim_material', 'materials.csv', ['material_id', 'material_name', 'unit']), ('dim_employee', 'employees.csv', ['employee_id', 'employee_name', 'job_title']),
                   ('dim_cost_category', 'cost_categories.csv', ['category_id', 'category_name'])]:
    rows = read(f); pk = 'category_key' if t == 'dim_cost_category' else t[4:] + '_key'
    dims[t] = {r[cols[0]]: i for i, r in enumerate(rows, 1)}
    out.append(ins(t, [pk] + cols, [[i] + [r[c] for c in cols] for i, r in enumerate(rows, 1)]))
client = dims['dim_client']
prj = read('projects.csv'); project = {p['project_id']: i for i, p in enumerate(prj, 1)}
out.append(ins('dim_project', ['project_key', 'project_id', 'project_name', 'project_type', 'location', 'client_key', 'approved_budget_ghs'],
               [[i, p['project_id'], p['project_name'], p['project_type'], p['location'], client[p['client_id']], float(p['approved_budget_ghs'])] for i, p in enumerate(prj, 1)]))
start = date(2025, 1, 1); dates = {}; drows = []
for o in range(365):
    d = start + timedelta(days=o); k = int(d.strftime('%Y%m%d')); dates[d.isoformat()] = k
    drows.append([k, d.isoformat(), d.day, d.month, (d.month - 1) // 3 + 1, d.year])
out.append(ins('dim_date', ['date_key', 'full_date', 'day', 'month', 'quarter', 'year'], drows))
def fk(m, k, n):
    if k not in m: raise ValueError('unknown ' + n + ': ' + k)
    return m[k]
def num(x, n, positive=False):
    f = float(x)
    if (f <= 0) if positive else (f < 0): raise ValueError('invalid ' + n)
    return round(f, 2)
def dk(v):
    try: date.fromisoformat(v)
    except ValueError: raise ValueError('invalid date')
    return fk(dates, v, 'date')
S, M, E, C = dims['dim_supplier'], dims['dim_material'], dims['dim_employee'], dims['dim_cost_category']
fin = lambda r: [r['transaction_id'], fk(project, r['project_id'], 'project'), dk(r['transaction_date']), fk(C, r['category_id'], 'category'), num(r['actual_cost_ghs'], 'actual cost')]
def pur(r):
    a = num(r['quantity'], 'quantity', True); b = num(r['unit_price_ghs'], 'price')
    return [r['purchase_line_id'], fk(project, r['project_id'], 'project'), dk(r['purchase_date']), fk(S, r['supplier_id'], 'supplier'), fk(M, r['material_id'], 'material'), a, b, round(a * b, 2)]
def use(r):
    a = num(r['quantity_used'], 'quantity', True); b = num(r['unit_cost_ghs'], 'cost')
    return [r['usage_id'], fk(project, r['project_id'], 'project'), dk(r['usage_date']), fk(M, r['material_id'], 'material'), a, b, round(a * b, 2)]
def lab(r):
    a = num(r['hours_worked'], 'hours', True); b = num(r['hourly_rate_ghs'], 'rate')
    return [r['labor_entry_id'], fk(project, r['project_id'], 'project'), dk(r['work_date']), fk(E, r['employee_id'], 'employee'), a, b, round(a * b, 2)]
rejected, stats, facts = [], {}, {}
for t, f, idf, pk, cols, fn in [
    ('fact_project_cost', 'finance_raw.csv', 'transaction_id', 'cost_key', ['transaction_id', 'project_key', 'date_key', 'category_key', 'actual_cost_ghs'], fin),
    ('fact_procurement', 'procurement_raw.csv', 'purchase_line_id', 'procurement_key', ['purchase_line_id', 'project_key', 'date_key', 'supplier_key', 'material_key', 'quantity', 'unit_price_ghs', 'purchase_cost_ghs'], pur),
    ('fact_material_usage', 'usage_raw.csv', 'usage_id', 'usage_key', ['usage_id', 'project_key', 'date_key', 'material_key', 'quantity_used', 'unit_cost_ghs', 'total_material_cost_ghs'], use),
    ('fact_labor', 'labour_raw.csv', 'labor_entry_id', 'labor_key', ['labor_entry_id', 'project_key', 'date_key', 'employee_key', 'hours_worked', 'hourly_rate_ghs', 'labor_cost_ghs'], lab)]:
    raw = read(f); seen = set(); good = []
    for r in raw:
        try:
            u = r[idf]
            if not u or u in seen: raise ValueError('duplicate or missing source identifier')
            seen.add(u); good.append(fn(r))
        except (ValueError, KeyError) as e: rejected.append([f, r.get(idf, ''), str(e)])
    stats[t] = {'raw': len(raw), 'loaded': len(good), 'rejected': len(raw) - len(good)}
    facts[t] = [[i] + g for i, g in enumerate(good, 1)]
    out.append(ins(t, [pk] + cols, facts[t]))
# ---- verify against the Coursework 4 build outputs ----
val = json.loads((CW / 'outputs/validation.json').read_text())
assert stats == val['etl'], (stats, val['etl']); assert len(rejected) == val['total_raw_rejected']
with open(CW / 'outputs/rejected_records.csv', encoding='utf-8') as f: assert [list(r.values()) for r in csv.DictReader(f)] == rejected
sq = sqlite3.connect(CW / 'rockshell_warehouse.sqlite')
for t, rows in facts.items():
    assert [list(r) for r in sq.execute(f'select * from {t} order by 1')] == rows, t
counts = {t: sq.execute(f'select count(*) from {t}').fetchone()[0] for t in val['tables']}; assert counts == val['tables']
# ---- ETL metadata ----
out.append("insert into rockshell.etl_run_log(run_id,run_label,source_system,notes) values (1,'Coursework 4 build','raw_data/*.csv (synthetic)','Python validation rules from build_warehouse.py re-applied; loaded to PostgreSQL');\n")
src = {'fact_project_cost': 'finance_raw.csv', 'fact_procurement': 'procurement_raw.csv', 'fact_material_usage': 'usage_raw.csv', 'fact_labor': 'labour_raw.csv'}
out.append(ins('etl_load_stats', ['run_id', 'fact_table', 'source_file', 'raw_rows', 'loaded_rows', 'rejected_rows'], [[1, t, src[t], s['raw'], s['loaded'], s['rejected']] for t, s in stats.items()]))
out.append(ins('dq_rejected_record', ['run_id', 'source_file', 'source_identifier', 'rejection_reason'], [[1] + r for r in rejected]))
exp = [[1, 'rows_' + t, v] for t, v in val['tables'].items()] + [[1, 'total_raw_rejected', val['total_raw_rejected']], [1, 'foreign_key_violations', 0]]
out.append(ins('validation_expected', ['run_id', 'check_name', 'expected'], exp))
(H.parent / 'migrations/02_cw4_data.sql').write_text(''.join(out), encoding='utf-8')
print(stats, len(rejected), sum(len(v) for v in facts.values()))
