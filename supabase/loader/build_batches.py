"""Extract the cleaned star rows from the local galaxy DW (PostgreSQL 16) and write batched
multi-row INSERT files for Supabase. Usage: python build_batches.py  -> ../data_batches/*.sql"""
import os, datetime as dt, decimal, json, psycopg
DB = os.environ.get("DATABASE_URL", "postgresql://postgres@/rockshell_dw?host=/tmp")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_batches")
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))

def lit(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int, decimal.Decimal, float)): return str(v)
    if isinstance(v, dt.datetime): return "'" + v.isoformat() + "'"
    if isinstance(v, dt.date): return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"

con = psycopg.connect(DB)
q = lambda sql: con.execute(sql).fetchall()
manifest = {}
seq = [0]
def write(table, cols, rows, batch=4000):
    manifest[table] = manifest.get(table, 0) + len(rows)
    for i in range(0, len(rows), batch):
        seq[0] += 1
        chunk = rows[i:i + batch]
        body = ",\n".join("(" + ",".join(lit(v) for v in r) + ")" for r in chunk)
        path = os.path.join(OUT, f"{seq[0]:02d}_{table}_{i // batch + 1}.sql")
        with open(path, "w") as fh:
            fh.write(f"INSERT INTO rockshell.{table} ({', '.join(cols)}) VALUES\n{body};\n")

# ---- dimensions
dcols = ["date_key","full_date","day_of_week","day_name","week_of_year","month_number","month_name","year_month","quarter","year","is_weekend"]
write("dim_date", dcols, [(0,)+(None,)*10] + q(f"select {','.join(dcols)} from dw.dim_date order by 1"))
write("dim_client", ["client_key","client_id","client_name","client_type","region"],
      [(0,"UNK","Unknown client",None,None)] + q("select client_key,client_id,client_name,client_type,region from dw.dim_client order by 1"))
write("dim_project", ["project_key","project_id","project_name","project_type","town","region","client_name","project_manager","project_status",
      "contract_value_ghs","start_date","planned_end_date","actual_end_date","planned_pct_complete","actual_pct_complete","progress_as_of","valid_from","valid_to","is_current"],
      q("""with lp as (select distinct on (p.project_id) p.project_id, f.planned_pct_complete, f.actual_pct_complete, d.full_date
                       from dw.fact_project_progress f join dw.dim_project p using (project_key) join dw.dim_date d using (date_key)
                       order by p.project_id, d.full_date desc)
           select p.project_key,p.project_id,p.project_name,p.project_type,p.town,p.region,c.client_name,p.project_manager,p.project_status,
                  p.contract_value,p.start_date,p.planned_end_date,p.actual_end_date,lp.planned_pct_complete,lp.actual_pct_complete,lp.full_date,
                  p.valid_from,p.valid_to,p.is_current
           from dw.dim_project p left join dw.dim_client c using (client_id) left join lp using (project_id) order by 1"""))
write("dim_supplier", ["supplier_key","supplier_id","supplier_name","supplier_type","town"],
      [(0,"N/A","Not applicable",None,None)] + q("select supplier_key,supplier_id,supplier_name,supplier_type,town from dw.dim_supplier order by 1"))
write("dim_material", ["material_key","material_id","material_name","material_category","standard_unit","standard_price_ghs"],
      [(0,"N/A","Not applicable",None,None,None)] + q("select material_key,material_id,material_name,material_category,standard_unit,standard_price from dw.dim_material order by 1"))
write("dim_cost_category", ["cost_category_key","cost_category_code","cost_category_name","cost_group"],
      q("select cost_category_key,cost_category_code,cost_category_name,cost_group from dw.dim_cost_category order by 1"))
write("dim_employee", ["employee_key","employee_id","employee_name","job_title","department","employment_type","valid_from","valid_to","is_current"],
      [(0,"N/A","Not applicable",None,None,None,dt.date(1900,1,1),dt.date(9999,12,31),True)] +
      q("select employee_key,employee_id,employee_name,job_title,department,employment_type,valid_from,valid_to,is_current from dw.dim_employee order by 1"))

# ---- the one fact table
fcols = ["date_key","project_key","client_key","cost_category_key","supplier_key","material_key","employee_key","expected_delivery_date_key",
         "actual_delivery_date_key","scenario","record_source","is_book_of_record","source_doc_no","budget_version","is_current_budget",
         "amount_ghs","quantity","unit_price_ghs","hours","overtime_hours","days_late","on_time_flag","price_variance_pct","price_variance_ghs"]
CLIENT = "(select c.client_key from dw.dim_project p2 join dw.dim_client c using (client_id) where p2.project_key = f.project_key)"
CAT = lambda code: f"(select cost_category_key from dw.dim_cost_category where cost_category_code='{code}')"
gl = q(f"""select f.date_key,f.project_key,{CLIENT},f.cost_category_key,coalesce(f.supplier_key,0),0,0,0,0,'ACTUAL','GL',true,f.doc_no,null,null,
                  f.actual_cost,null,null,null,null,null,null,null,null from dw.fact_project_cost f order by f.project_cost_key""")
po = q(f"""select f.order_date_key,f.project_key,{CLIENT},{CAT('MAT')},f.supplier_key,f.material_key,0,coalesce(f.expected_delivery_key,0),
                  coalesce(f.actual_delivery_key,0),'ACTUAL','PO',false,f.po_number||'-'||f.po_line,null,null,
                  f.purchase_cost,f.quantity_std,f.unit_price_std,null,null,
                  (ad.full_date - ed.full_date), (ad.full_date <= ed.full_date),
                  round(100*(f.unit_price_std/nullif(m.standard_price,0)-1),2), round((f.unit_price_std-m.standard_price)*f.quantity_std,2)
           from dw.fact_procurement f join dw.dim_material m using (material_key)
           left join dw.dim_date ed on ed.date_key=f.expected_delivery_key left join dw.dim_date ad on ad.date_key=f.actual_delivery_key
           order by f.procurement_key""")
lab = q(f"""select f.date_key,f.project_key,{CLIENT},{CAT('LAB')},0,0,f.employee_key,0,0,'ACTUAL','PAYROLL',false,f.timesheet_id,null,null,
                   f.labor_cost,null,null,f.hours_worked,f.overtime_hours,null,null,null,null from dw.fact_labor f order by f.labor_key""")
bud = q(f"""select f.effective_date_key,f.project_key,{CLIENT},f.cost_category_key,0,0,0,0,0,'BUDGET','BUDGET',true,
                   'BUD-'||p.project_id||'-'||c.cost_category_code||'-v'||f.budget_version, f.budget_version,
                   f.budget_version = max(f.budget_version) over (partition by p.project_id, f.cost_category_key),
                   f.budget_amount,null,null,null,null,null,null,null,null
            from dw.fact_budget_snapshot f join dw.dim_project p using (project_key) join dw.dim_cost_category c using (cost_category_key)
            order by f.budget_key""")
for name, rows in [("GL", gl), ("PO", po), ("PAYROLL", lab), ("BUDGET", bud)]:
    manifest[f"fact:{name}"] = len(rows)
write("fact_project_cost", fcols, gl + po + lab + bud, batch=3500)

# ---- lineage / DQ
write("etl_run_log", ["run_id","started_at","finished_at","status","triggered_by","notes"], q("select run_id,started_at,finished_at,status,triggered_by,notes from etl.etl_run_log order by 1"))
write("dq_source_counts", ["run_id","source","raw_rows","duplicates_removed","ids_recovered","rejected","clean_rows","loaded_into"],
      q("select run_id,source,raw_rows,duplicates_removed,ids_recovered,rejected,clean_rows,loaded_into from etl.dq_source_counts order by 1,2"))
write("dq_issue", ["run_id","source","rule_code","rule_name","rows_affected","example_before","example_after"],
      q("select run_id,source,rule_code,rule_name,rows_affected,example_before,example_after from etl.dq_rule_log order by 1,2,3"))
write("dq_rejected_row", ["run_id","source","source_row","reason","raw_record"],
      q("select run_id,source,source_row,reason,raw_record from etl.rejected_rows order by 1,2,3"))
write("reconciliation", ["run_id","check_name","expected","actual","difference","status"],
      q("select run_id,check_name,expected,actual,difference,status from etl.reconciliation order by 1"))
# expected totals for post-load checks
manifest["fact_sums"] = {k: str(sum(r[15] for r in v)) for k, v in [("GL", gl), ("PO", po), ("PAYROLL", lab), ("BUDGET", bud)]}
json.dump(manifest, open(os.path.join(OUT, "..", "loader", "source_manifest.json"), "w"), indent=2)
print(json.dumps(manifest, indent=2))
