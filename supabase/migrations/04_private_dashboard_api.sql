-- Safer wrapper for the coursework dashboard API.
-- Does not drop, truncate, reload or rename any table. Does not change row values.
-- Not applied to the hosted database by the repository itself. Run this once, in a session
-- that can create functions (the Supabase SQL editor or the sanctioned connector), on project
-- kthdkdbrokrcokngnfpy only.
--
-- Current Supabase guidance (Database Functions, and the RLS note on security definer):
--   * prefer security invoker
--   * if a function must be security definer, set search_path to '' and keep it out of the
--     exposed API schema
--   * revoke the default execute grant, then grant execute only to the roles that need it
--
-- After this migration:
--   * rockshell.dashboard_payload() holds the same JSON query as public.rockshell_dashboard()
--     did. It is security definer and lives in schema rockshell, which stays out of the
--     Data API exposed schemas.
--   * public.rockshell_dashboard() stays the RPC name the Pages function calls. It becomes
--     security invoker and only calls the private function.
--   * anon and authenticated receive usage on schema rockshell and execute on that one
--     function. They do not receive table, view or sequence privileges. RLS stays on and no
--     policy is added, so a direct table read is still denied.
--   * Keep schema rockshell out of Dashboard > API > Exposed schemas.

begin;

create or replace function rockshell.dashboard_payload()
returns json
language sql
stable
security definer
set search_path = ''
as $$
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

revoke all on function rockshell.dashboard_payload() from public, anon, authenticated;
grant execute on function rockshell.dashboard_payload() to anon, authenticated;

-- Drop is limited to the public function so its security attribute can change.
-- Tables are untouched. The private function already exists above, inside this transaction.
drop function if exists public.rockshell_dashboard();

create function public.rockshell_dashboard()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select rockshell.dashboard_payload();
$$;

revoke all on function public.rockshell_dashboard() from public;
grant execute on function public.rockshell_dashboard() to anon, authenticated;

grant usage on schema rockshell to anon, authenticated;

revoke all on all tables in schema rockshell from public, anon, authenticated;
revoke all on all sequences in schema rockshell from public, anon, authenticated;

comment on function rockshell.dashboard_payload() is
  'Private read-only aggregate for the coursework dashboard. Security definer. Schema rockshell is not an exposed API schema.';
comment on function public.rockshell_dashboard() is
  'Security invoker wrapper. Same JSON keys as the Coursework 4 dashboard. Calls rockshell.dashboard_payload().';

commit;
