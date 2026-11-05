-- Analysis views (mirror coursework4/analysis_queries.sql) + validation view + dashboard RPC.
create view rockshell.v_project_budget_vs_ledger with (security_invoker = true) as
select p.project_id, p.project_name, p.project_type, p.location, c.client_name,
       round(p.approved_budget_ghs,2) as approved_budget_ghs,
       round(coalesce(sum(f.actual_cost_ghs),0),2) as ledger_cost_ghs,
       round(p.approved_budget_ghs - coalesce(sum(f.actual_cost_ghs),0),2) as budget_less_ledger_cost_ghs,
       count(f.cost_key) as ledger_lines
from rockshell.dim_project p join rockshell.dim_client c on c.client_key = p.client_key
left join rockshell.fact_project_cost f on f.project_key = p.project_key
group by p.project_key, c.client_name order by ledger_cost_ghs desc;

create view rockshell.v_supplier_purchases with (security_invoker = true) as
select s.supplier_id, s.supplier_name, round(sum(f.purchase_cost_ghs),2) as purchase_total_ghs, count(*) as purchase_lines
from rockshell.fact_procurement f join rockshell.dim_supplier s on s.supplier_key = f.supplier_key
group by s.supplier_key order by purchase_total_ghs desc;

create view rockshell.v_project_labour with (security_invoker = true) as
select p.project_id, p.project_name, round(sum(l.hours_worked),2) as hours, round(sum(l.labor_cost_ghs),2) as labor_cost_ghs, count(*) as entries
from rockshell.fact_labor l join rockshell.dim_project p on p.project_key = l.project_key
group by p.project_key order by labor_cost_ghs desc;

create view rockshell.v_material_usage with (security_invoker = true) as
select m.material_id, m.material_name, m.unit, round(sum(u.quantity_used),2) as quantity_used, round(sum(u.total_material_cost_ghs),2) as usage_cost_ghs, count(*) as entries
from rockshell.fact_material_usage u join rockshell.dim_material m on m.material_key = u.material_key
group by m.material_key order by usage_cost_ghs desc;

create view rockshell.v_monthly_by_subject with (security_invoker = true) as
select 'Ledger cost' as subject, d.month, round(sum(f.actual_cost_ghs),2) as amount_ghs from rockshell.fact_project_cost f join rockshell.dim_date d using (date_key) group by d.month
union all select 'Procurement', d.month, round(sum(f.purchase_cost_ghs),2) from rockshell.fact_procurement f join rockshell.dim_date d using (date_key) group by d.month
union all select 'Material usage', d.month, round(sum(f.total_material_cost_ghs),2) from rockshell.fact_material_usage f join rockshell.dim_date d using (date_key) group by d.month
union all select 'Labour', d.month, round(sum(f.labor_cost_ghs),2) from rockshell.fact_labor f join rockshell.dim_date d using (date_key) group by d.month;

create view rockshell.v_table_counts with (security_invoker = true) as
select 'dim_client' as table_name, count(*) as row_count from rockshell.dim_client union all select 'dim_project', count(*) from rockshell.dim_project
union all select 'dim_supplier', count(*) from rockshell.dim_supplier union all select 'dim_material', count(*) from rockshell.dim_material
union all select 'dim_employee', count(*) from rockshell.dim_employee union all select 'dim_cost_category', count(*) from rockshell.dim_cost_category
union all select 'dim_date', count(*) from rockshell.dim_date union all select 'fact_project_cost', count(*) from rockshell.fact_project_cost
union all select 'fact_procurement', count(*) from rockshell.fact_procurement union all select 'fact_material_usage', count(*) from rockshell.fact_material_usage
union all select 'fact_labor', count(*) from rockshell.fact_labor;

-- Validation checks: expected values from coursework4/outputs/validation.json vs the live warehouse
create view rockshell.v_validation with (security_invoker = true) as
with actual as (
  select 'rows_' || table_name as check_name, row_count::numeric as actual from rockshell.v_table_counts
  union all select 'total_raw_rejected', count(*) from rockshell.dq_rejected_record
  union all select 'foreign_key_violations', (
      (select count(*) from rockshell.fact_project_cost f where not exists (select 1 from rockshell.dim_project p where p.project_key=f.project_key))
    + (select count(*) from rockshell.fact_procurement f where not exists (select 1 from rockshell.dim_supplier s where s.supplier_key=f.supplier_key))
    + (select count(*) from rockshell.fact_material_usage f where not exists (select 1 from rockshell.dim_material m where m.material_key=f.material_key))
    + (select count(*) from rockshell.fact_labor f where not exists (select 1 from rockshell.dim_employee e where e.employee_key=f.employee_key)))::numeric)
select e.check_name, e.expected, a.actual, case when a.actual = e.expected then 'PASS' else 'FAIL' end as status
from rockshell.validation_expected e join actual a using (check_name) order by e.check_name;

create or replace function public.rockshell_dashboard() returns json
language sql stable security definer set search_path = '' as $$
select json_build_object(
  'design', 'Coursework 4 fact constellation: 4 fact tables, 7 shared dimensions',
  'generated_at', now(),
  'projects', (select json_agg(v) from rockshell.v_project_budget_vs_ledger v),
  'suppliers', (select json_agg(v) from rockshell.v_supplier_purchases v),
  'labour', (select json_agg(v) from rockshell.v_project_labour v),
  'materials', (select json_agg(v) from rockshell.v_material_usage v),
  'monthly', (select json_agg(v order by subject, month) from rockshell.v_monthly_by_subject v),
  'totals', json_build_object(
     'approved_budget_ghs', (select sum(approved_budget_ghs) from rockshell.dim_project),
     'ledger_cost_ghs', (select sum(actual_cost_ghs) from rockshell.fact_project_cost),
     'procurement_ghs', (select sum(purchase_cost_ghs) from rockshell.fact_procurement),
     'material_usage_ghs', (select sum(total_material_cost_ghs) from rockshell.fact_material_usage),
     'labour_ghs', (select sum(labor_cost_ghs) from rockshell.fact_labor),
     'labour_hours', (select sum(hours_worked) from rockshell.fact_labor)),
  'etl', (select json_agg(s order by s.raw_rows) from rockshell.etl_load_stats s),
  'etl_run', (select row_to_json(r) from rockshell.etl_run_log r order by run_id desc limit 1),
  'rejected', (select json_agg(r order by rejected_id) from rockshell.dq_rejected_record r),
  'validation', (select json_agg(v) from rockshell.v_validation v),
  'table_counts', (select json_object_agg(table_name, row_count) from rockshell.v_table_counts));
$$;
revoke all on function public.rockshell_dashboard() from public;
grant execute on function public.rockshell_dashboard() to anon, authenticated;
