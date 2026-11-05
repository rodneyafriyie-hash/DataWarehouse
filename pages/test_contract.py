"""Offline checks for the coursework warehouse and the dashboard source.

No browser and no network. Does not touch a hosted database.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CW = ROOT / 'coursework4'
SNAP = ROOT / 'pages' / 'functions' / '_snapshot.json'
HTML = (ROOT / 'pages' / 'public' / 'index.html').read_text(encoding='utf-8')
JS = (ROOT / 'pages' / 'public' / 'app.js').read_text(encoding='utf-8')
CSS = (ROOT / 'pages' / 'public' / 'styles.css').read_text(encoding='utf-8')
README = (ROOT / 'README.md').read_text(encoding='utf-8')
DICT = (ROOT / 'docs' / 'data_dictionary.md').read_text(encoding='utf-8')

EXPECTED = {
    'approved_budget_ghs': 11426147.00,
    'ledger_cost_ghs': 1900433.58,
    'procurement_ghs': 5814700.47,
    'material_usage_ghs': 2144371.38,
    'labour_ghs': 273827.18,
    'labour_hours': 4945.0,
}
COUNTS = {
    'dim_client': 8, 'dim_project': 12, 'dim_supplier': 12, 'dim_material': 15,
    'dim_employee': 40, 'dim_cost_category': 5, 'dim_date': 365,
    'fact_project_cost': 400, 'fact_procurement': 600,
    'fact_material_usage': 700, 'fact_labor': 900,
}
TOP3 = [
    ('P009', 777461.0, 217339.21, 560121.79),
    ('P003', 1450763.0, 212453.18, 1238309.82),
    ('P005', 255315.0, 197866.56, 57448.44),
]

def close(a, b):
    return abs(float(a) - float(b)) < 0.02

def main():
    errors = []
    val = json.loads((CW / 'outputs' / 'validation.json').read_text(encoding='utf-8'))
    if val['tables'] != COUNTS:
        errors.append('validation.json table counts drifted')
    if val['total_raw_rejected'] != 12:
        errors.append('validation.json rejected count drifted')
    db = sqlite3.connect(CW / 'rockshell_warehouse.sqlite')
    for table, count in COUNTS.items():
        got = db.execute(f'select count(*) from {table}').fetchone()[0]
        if got != count:
            errors.append(f'sqlite {table} is {got}, expected {count}')
    ledger = db.execute('select round(sum(actual_cost_ghs), 2) from fact_project_cost').fetchone()[0]
    budget = db.execute('select round(sum(approved_budget_ghs), 2) from dim_project').fetchone()[0]
    purch = db.execute('select round(sum(purchase_cost_ghs), 2) from fact_procurement').fetchone()[0]
    mat = db.execute('select round(sum(total_material_cost_ghs), 2) from fact_material_usage').fetchone()[0]
    labour = db.execute('select round(sum(labor_cost_ghs), 2) from fact_labor').fetchone()[0]
    hours = db.execute('select round(sum(hours_worked), 2) from fact_labor').fetchone()[0]
    sql_totals = {
        'approved_budget_ghs': budget, 'ledger_cost_ghs': ledger, 'procurement_ghs': purch,
        'material_usage_ghs': mat, 'labour_ghs': labour, 'labour_hours': hours,
    }
    for key, exp in EXPECTED.items():
        if not close(sql_totals[key], exp):
            errors.append(f'sqlite {key} is {sql_totals[key]}, expected {exp}')
    rows = db.execute('''
        select p.project_id, round(p.approved_budget_ghs, 2), round(coalesce(sum(c.actual_cost_ghs), 0), 2),
               round(p.approved_budget_ghs - coalesce(sum(c.actual_cost_ghs), 0), 2)
        from dim_project p left join fact_project_cost c on c.project_key = p.project_key
        group by p.project_key order by 3 desc limit 3
    ''').fetchall()
    for got, exp in zip(rows, TOP3):
        if got[0] != exp[0] or any(not close(got[i], exp[i]) for i in (1, 2, 3)):
            errors.append(f'top ledger row {got} != {exp}')
    fk = db.execute('''
        select
          (select count(*) from fact_project_cost f where not exists (select 1 from dim_project p where p.project_key = f.project_key))
        + (select count(*) from fact_procurement f where not exists (select 1 from dim_supplier s where s.supplier_key = f.supplier_key))
        + (select count(*) from fact_material_usage f where not exists (select 1 from dim_material m where m.material_key = f.material_key))
        + (select count(*) from fact_labor f where not exists (select 1 from dim_employee e where e.employee_key = f.employee_key))
    ''').fetchone()[0]
    if fk != 0:
        errors.append(f'sqlite foreign key gaps: {fk}')

    snap = json.loads(SNAP.read_text(encoding='utf-8'))
    for key, exp in EXPECTED.items():
        if not close(snap['totals'][key], exp):
            errors.append(f'snapshot {key} is {snap["totals"][key]}')
    if snap['table_counts'] != {k: v for k, v in COUNTS.items()}:
        # table_counts values may be ints already
        if {k: int(v) for k, v in snap['table_counts'].items()} != COUNTS:
            errors.append('snapshot table counts drifted')
    passed = [v for v in snap['validation'] if v['status'] == 'PASS']
    if len(snap['validation']) != 13 or len(passed) != 13:
        errors.append('snapshot validation is not 13/13')
    if len(snap['rejected']) != 12:
        errors.append('snapshot rejected rows are not 12')
    units = {m['unit'] for m in snap['materials']}
    if len(units) < 2:
        errors.append('material units collapsed; a quantity total would be misleading')

    ui = HTML + JS + CSS + README + DICT
    if '\u2014' in ui:
        errors.append('em dash found in dashboard or docs')
    for phrase in ('Do not add', 'Synthetic', 'fact_project_cost', 'fact_procurement', 'fact_material_usage', 'fact_labor', 'Coursework prototype'):
        if phrase not in HTML and phrase not in JS and phrase not in README:
            errors.append('missing phrase: ' + phrase)
    if 'tabs' in HTML or 'data-page=' in HTML:
        errors.append('tab interface returned')
    if 'border-left' in CSS:
        errors.append('card edge bar returned')
    if 'Power BI' not in README or 'does not include a Power BI' not in README:
        errors.append('README must say Power BI is not in this repository')
    # The page must not print the sum of the four money subjects.
    mixed = EXPECTED['ledger_cost_ghs'] + EXPECTED['procurement_ghs'] + EXPECTED['material_usage_ghs'] + EXPECTED['labour_ghs']
    mixed_text = 'GH₵' + f'{mixed:,.2f}'
    if mixed_text in JS or mixed_text in HTML:
        errors.append('combined money total was hardcoded')
    dash_html = (ROOT / 'dashboard' / 'public' / 'index.html').read_text(encoding='utf-8')
    if dash_html != HTML:
        errors.append('dashboard and pages HTML diverged')
    if (ROOT / 'dashboard' / 'public' / 'app.js').read_text(encoding='utf-8') != JS:
        errors.append('dashboard and pages JS diverged')

    if errors:
        print('FAIL')
        for err in errors:
            print('-', err)
        return 1
    print('PASS', 'sqlite and snapshot totals match, UI source keeps the four subjects apart')
    return 0

if __name__ == '__main__':
    sys.exit(main())
