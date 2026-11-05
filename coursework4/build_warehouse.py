"""Rockshell academic prototype. All company transactions and names are synthetic.
Python 3 standard library only; SQLite models a warehouse for portable demonstration.
Run: python build_warehouse.py
"""
import csv, random, sqlite3, json
from pathlib import Path
from datetime import date,timedelta
ROOT=Path(__file__).resolve().parent; RAW=ROOT/'raw_data'; OUT=ROOT/'outputs'
RAW.mkdir(exist_ok=True);OUT.mkdir(exist_ok=True)
r=random.Random(2026)
projects=[(f'P{i:03}',f'Rockshell Project {i:02}',r.choice(['Residential','Commercial','Infrastructure']),r.choice(['Accra','Tema','Kumasi','Takoradi']),f'C{1+(i-1)%8:03}',r.randint(250000,1600000)) for i in range(1,13)]
clients=[(f'C{i:03}',f'Synthetic Client {i:02}') for i in range(1,9)]
suppliers=[(f'S{i:03}',f'Synthetic Supplier {i:02}') for i in range(1,13)]
materials=[(f'M{i:03}',n,u) for i,(n,u) in enumerate([('Cement','bag'),('Rebar','tonne'),('Sand','tonne'),('Gravel','tonne'),('Paint','litre'),('Timber','piece'),('Bricks','piece'),('Tiles','box'),('PVC Pipe','metre'),('Roofing Sheet','sheet'),('Cable','metre'),('Concrete Blocks','piece'),('Adhesive','bag'),('Door','piece'),('Glass','sqm')],1)]
employees=[(f'E{i:03}',f'Synthetic Worker {i:03}',r.choice(['Mason','Electrician','Engineer','Carpenter','Labourer','Plumber'])) for i in range(1,41)]
categories=[('CAT01','Equipment'),('CAT02','Transport'),('CAT03','Utilities'),('CAT04','Site Administration'),('CAT05','Permits')]
start=date(2025,1,1)
def randdate():return (start+timedelta(days=r.randint(0,364))).isoformat()
def writer(name,cols,rows):
 with (RAW/name).open('w',newline='',encoding='utf-8') as f:
  w=csv.writer(f);w.writerow(cols);w.writerows(rows)
writer('projects.csv',['project_id','project_name','project_type','location','client_id','approved_budget_ghs'],projects)
writer('clients.csv',['client_id','client_name'],clients)
writer('suppliers.csv',['supplier_id','supplier_name'],suppliers)
writer('materials.csv',['material_id','material_name','unit'],materials)
writer('employees.csv',['employee_id','employee_name','job_title'],employees)
writer('cost_categories.csv',['category_id','category_name'],categories)
finance=[]
for i in range(1,401):
 p=r.choice(projects); c=r.choice(categories)
 finance.append([f'FC{i:05}',p[0],randdate(),c[0],round(r.uniform(125,8900),2)])
# Specific intentional malformed rows: duplicate, unknown project, negative expense
finance += [finance[12].copy(),['FC99998','P999','2025-04-03','CAT02',999.00],['FC99999','P001','2025-05-02','CAT01',-125.00]]
writer('finance_raw.csv',['transaction_id','project_id','transaction_date','category_id','actual_cost_ghs'],finance)
proc=[]
for i in range(1,601):
 p=r.choice(projects);s=r.choice(suppliers);m=r.choice(materials); qty=r.randint(2,90);price=round(r.uniform(12,450),2)
 proc.append([f'PO{i:05}',p[0],randdate(),s[0],m[0],qty,price])
proc += [proc[21].copy(),['PO99998','P001','not-a-date','S001','M001',30,50.00],['PO99999','P001','2025-06-03','S001','M001',0,50.00]]
writer('procurement_raw.csv',['purchase_line_id','project_id','purchase_date','supplier_id','material_id','quantity','unit_price_ghs'],proc)
usage=[]
for i in range(1,701):
 p=r.choice(projects);m=r.choice(materials);q=r.randint(1,50)
 usage.append([f'MU{i:05}',p[0],randdate(),m[0],q,round(r.uniform(5,250),2)])
usage += [usage[3].copy(),['MU99998','P003','2025-07-11','M777',10,40],['MU99999','P001','2025-09-21','M002',-3,60]]
writer('usage_raw.csv',['usage_id','project_id','usage_date','material_id','quantity_used','unit_cost_ghs'],usage)
labour=[]
for i in range(1,901):
 p=r.choice(projects);e=r.choice(employees);labour.append([f'LB{i:05}',p[0],randdate(),e[0],r.randint(1,10),round(r.uniform(12,100),2)])
labour += [labour[7].copy(),['LB99998','P001','2025-10-05','E999',6,50],['LB99999','P001','2025-10-05','E001',0,50]]
writer('labour_raw.csv',['labor_entry_id','project_id','work_date','employee_id','hours_worked','hourly_rate_ghs'],labour)
SCHEMA='''PRAGMA foreign_keys=ON;
CREATE TABLE dim_client(client_key INTEGER PRIMARY KEY,client_id TEXT UNIQUE NOT NULL,client_name TEXT NOT NULL);
CREATE TABLE dim_project(project_key INTEGER PRIMARY KEY,project_id TEXT UNIQUE NOT NULL,project_name TEXT NOT NULL,project_type TEXT,location TEXT,client_key INTEGER NOT NULL REFERENCES dim_client(client_key),approved_budget_ghs REAL NOT NULL CHECK(approved_budget_ghs>=0));
CREATE TABLE dim_supplier(supplier_key INTEGER PRIMARY KEY,supplier_id TEXT UNIQUE NOT NULL,supplier_name TEXT NOT NULL);
CREATE TABLE dim_material(material_key INTEGER PRIMARY KEY,material_id TEXT UNIQUE NOT NULL,material_name TEXT NOT NULL,unit TEXT NOT NULL);
CREATE TABLE dim_employee(employee_key INTEGER PRIMARY KEY,employee_id TEXT UNIQUE NOT NULL,employee_name TEXT NOT NULL,job_title TEXT NOT NULL);
CREATE TABLE dim_cost_category(category_key INTEGER PRIMARY KEY,category_id TEXT UNIQUE NOT NULL,category_name TEXT NOT NULL);
CREATE TABLE dim_date(date_key INTEGER PRIMARY KEY,full_date TEXT UNIQUE NOT NULL,day INTEGER NOT NULL,month INTEGER NOT NULL,quarter INTEGER NOT NULL,year INTEGER NOT NULL);
CREATE TABLE fact_project_cost(cost_key INTEGER PRIMARY KEY,transaction_id TEXT UNIQUE NOT NULL,project_key INTEGER NOT NULL REFERENCES dim_project(project_key),date_key INTEGER NOT NULL REFERENCES dim_date(date_key),category_key INTEGER NOT NULL REFERENCES dim_cost_category(category_key),actual_cost_ghs REAL NOT NULL CHECK(actual_cost_ghs>=0));
CREATE TABLE fact_procurement(procurement_key INTEGER PRIMARY KEY,purchase_line_id TEXT UNIQUE NOT NULL,project_key INTEGER NOT NULL REFERENCES dim_project(project_key),date_key INTEGER NOT NULL REFERENCES dim_date(date_key),supplier_key INTEGER NOT NULL REFERENCES dim_supplier(supplier_key),material_key INTEGER NOT NULL REFERENCES dim_material(material_key),quantity REAL NOT NULL CHECK(quantity>0),unit_price_ghs REAL NOT NULL CHECK(unit_price_ghs>=0),purchase_cost_ghs REAL NOT NULL CHECK(purchase_cost_ghs>=0));
CREATE TABLE fact_material_usage(usage_key INTEGER PRIMARY KEY,usage_id TEXT UNIQUE NOT NULL,project_key INTEGER NOT NULL REFERENCES dim_project(project_key),date_key INTEGER NOT NULL REFERENCES dim_date(date_key),material_key INTEGER NOT NULL REFERENCES dim_material(material_key),quantity_used REAL NOT NULL CHECK(quantity_used>0),unit_cost_ghs REAL NOT NULL CHECK(unit_cost_ghs>=0),total_material_cost_ghs REAL NOT NULL CHECK(total_material_cost_ghs>=0));
CREATE TABLE fact_labor(labor_key INTEGER PRIMARY KEY,labor_entry_id TEXT UNIQUE NOT NULL,project_key INTEGER NOT NULL REFERENCES dim_project(project_key),date_key INTEGER NOT NULL REFERENCES dim_date(date_key),employee_key INTEGER NOT NULL REFERENCES dim_employee(employee_key),hours_worked REAL NOT NULL CHECK(hours_worked>0),hourly_rate_ghs REAL NOT NULL CHECK(hourly_rate_ghs>=0),labor_cost_ghs REAL NOT NULL CHECK(labor_cost_ghs>=0));
'''
(ROOT/'schema.sql').write_text(SCHEMA,encoding='utf-8')
DB=ROOT/'rockshell_warehouse.sqlite';DB.unlink(missing_ok=True)
cx=sqlite3.connect(DB);cx.executescript(SCHEMA)
def read(name):
 with (RAW/name).open(encoding='utf-8',newline='') as f:return list(csv.DictReader(f))
for table,file,idname,cols in [
 ('dim_client','clients.csv','client_id',['client_id','client_name']),('dim_supplier','suppliers.csv','supplier_id',['supplier_id','supplier_name']),('dim_material','materials.csv','material_id',['material_id','material_name','unit']),('dim_employee','employees.csv','employee_id',['employee_id','employee_name','job_title']),('dim_cost_category','cost_categories.csv','category_id',['category_id','category_name'])]:
 for row in read(file):cx.execute(f'INSERT INTO {table} ({",".join(cols)}) VALUES ({",".join("?"*len(cols))})',[row[c] for c in cols])
def keys(table,id_col):
 pk = 'category_key' if table == 'dim_cost_category' else table[4:]+'_key'
 return {x[1]:x[0] for x in cx.execute(f'SELECT {pk}, {id_col} FROM {table}')}
client=keys('dim_client','client_id'); supplier=keys('dim_supplier','supplier_id'); material=keys('dim_material','material_id'); employee=keys('dim_employee','employee_id'); cat=keys('dim_cost_category','category_id')
for p in read('projects.csv'):
 cx.execute('INSERT INTO dim_project(project_id,project_name,project_type,location,client_key,approved_budget_ghs) VALUES(?,?,?,?,?,?)',(p['project_id'],p['project_name'],p['project_type'],p['location'],client[p['client_id']],float(p['approved_budget_ghs'])))
project=keys('dim_project','project_id')
for offset in range(365):
 d=start+timedelta(days=offset);k=int(d.strftime('%Y%m%d'));cx.execute('INSERT INTO dim_date VALUES(?,?,?,?,?,?)',(k,d.isoformat(),d.day,d.month,(d.month-1)//3+1,d.year))
dates={x[1]:x[0] for x in cx.execute('SELECT date_key,full_date FROM dim_date')}
rejected=[]; stats={}
def process(label,filename,id_field,fields,fn):
 seen=set();valid=0;raw=read(filename)
 for row in raw:
  try:
   uid=row[id_field]
   if not uid or uid in seen:raise ValueError('duplicate or missing source identifier')
   seen.add(uid)
   parsed=fn(row)
   cx.execute(f'INSERT INTO {label}({",".join(fields)}) VALUES ({",".join("?"*len(parsed))})',parsed)
   valid+=1
  except (ValueError,KeyError,sqlite3.IntegrityError) as e:rejected.append([filename,row.get(id_field,''),str(e)])
 stats[label]={'raw':len(raw),'loaded':valid,'rejected':len(raw)-valid}
def fk(mapping,key,name):
 if key not in mapping:raise ValueError('unknown '+name+': '+key)
 return mapping[key]
def num(x,name,positive=False):
 f=float(x)
 if f<=0 if positive else f<0:raise ValueError('invalid '+name)
 return round(f,2)
def datekey(v):
 try:date.fromisoformat(v)
 except ValueError:raise ValueError('invalid date')
 return fk(dates,v,'date')
def fin(row):return [row['transaction_id'],fk(project,row['project_id'],'project'),datekey(row['transaction_date']),fk(cat,row['category_id'],'category'),num(row['actual_cost_ghs'],'actual cost')]
def pur(row):
 q=num(row['quantity'],'quantity',True);price=num(row['unit_price_ghs'],'price')
 return [row['purchase_line_id'],fk(project,row['project_id'],'project'),datekey(row['purchase_date']),fk(supplier,row['supplier_id'],'supplier'),fk(material,row['material_id'],'material'),q,price,round(q*price,2)]
def use(row):
 q=num(row['quantity_used'],'quantity',True);price=num(row['unit_cost_ghs'],'cost')
 return [row['usage_id'],fk(project,row['project_id'],'project'),datekey(row['usage_date']),fk(material,row['material_id'],'material'),q,price,round(q*price,2)]
def lab(row):
 hrs=num(row['hours_worked'],'hours',True);rate=num(row['hourly_rate_ghs'],'rate')
 return [row['labor_entry_id'],fk(project,row['project_id'],'project'),datekey(row['work_date']),fk(employee,row['employee_id'],'employee'),hrs,rate,round(hrs*rate,2)]
process('fact_project_cost','finance_raw.csv','transaction_id',['transaction_id','project_key','date_key','category_key','actual_cost_ghs'],fin)
process('fact_procurement','procurement_raw.csv','purchase_line_id',['purchase_line_id','project_key','date_key','supplier_key','material_key','quantity','unit_price_ghs','purchase_cost_ghs'],pur)
process('fact_material_usage','usage_raw.csv','usage_id',['usage_id','project_key','date_key','material_key','quantity_used','unit_cost_ghs','total_material_cost_ghs'],use)
process('fact_labor','labour_raw.csv','labor_entry_id',['labor_entry_id','project_key','date_key','employee_key','hours_worked','hourly_rate_ghs','labor_cost_ghs'],lab)
cx.commit()
with (OUT/'rejected_records.csv').open('w',newline='',encoding='utf-8') as f:w=csv.writer(f);w.writerow(['source_file','source_identifier','rejection_reason']);w.writerows(rejected)
query='''SELECT p.project_id,p.project_name,ROUND(p.approved_budget_ghs,2) AS approved_budget_ghs,ROUND(COALESCE(SUM(c.actual_cost_ghs),0),2) AS ledger_cost_ghs,ROUND(p.approved_budget_ghs-COALESCE(SUM(c.actual_cost_ghs),0),2) AS budget_less_ledger_cost_ghs FROM dim_project p LEFT JOIN fact_project_cost c ON c.project_key=p.project_key GROUP BY p.project_key ORDER BY ledger_cost_ghs DESC;'''
(ROOT/'analysis_queries.sql').write_text('''-- Report separately: these cost datasets may overlap; do NOT add them without financial reconciliation.\n'''+query+'\n\nSELECT s.supplier_name,ROUND(SUM(f.purchase_cost_ghs),2) AS purchase_total_ghs FROM fact_procurement f JOIN dim_supplier s ON s.supplier_key=f.supplier_key GROUP BY s.supplier_key ORDER BY purchase_total_ghs DESC LIMIT 5;\n\nSELECT p.project_name,ROUND(SUM(l.hours_worked),2) AS hours, ROUND(SUM(l.labor_cost_ghs),2) AS labor_cost_ghs FROM fact_labor l JOIN dim_project p ON p.project_key=l.project_key GROUP BY p.project_key ORDER BY labor_cost_ghs DESC LIMIT 5;\n''',encoding='utf-8')
rows=cx.execute(query).fetchall()
with (OUT/'project_cost_report.csv').open('w',newline='',encoding='utf-8') as f:
 w=csv.writer(f);w.writerow(['project_id','project_name','approved_budget_ghs','ledger_cost_ghs','budget_less_ledger_cost_ghs']);w.writerows(rows)
counts={t:cx.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['dim_client','dim_project','dim_supplier','dim_material','dim_employee','dim_cost_category','dim_date','fact_project_cost','fact_procurement','fact_material_usage','fact_labor']}
result={'tables':counts,'etl':stats,'total_raw_rejected':len(rejected),'foreign_key_violations':list(cx.execute('PRAGMA foreign_key_check')),'project_cost_preview':rows[:3]}
(OUT/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8');cx.close();print(json.dumps(result,indent=2))
