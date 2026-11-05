-- Read-only checks for supabase/migrations/04_private_dashboard_api.sql.
-- Run AFTER that migration, on project kthdkdbrokrcokngnfpy, as a role that can set role to anon.
-- The script rolls back so it leaves no objects and does not stay logged in as anon.
-- Expected coursework figures are the verified synthetic totals. A mismatch means stop.

begin;

do $$
declare
  payload json;
  definer boolean;
  invoker boolean;
  blocked text;
begin
  select p.prosecdef into definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'rockshell' and p.proname = 'dashboard_payload';
  if definer is distinct from true then
    raise exception 'rockshell.dashboard_payload() must be security definer';
  end if;

  select p.prosecdef into invoker
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rockshell_dashboard';
  if invoker is distinct from false then
    raise exception 'public.rockshell_dashboard() must be security invoker';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'rockshell' and p.proname = 'dashboard_payload'
      and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%')
  ) then
    raise exception 'private function is missing a fixed search_path';
  end if;

  payload := public.rockshell_dashboard();
  if (payload->'totals'->>'approved_budget_ghs')::numeric <> 11426147.00 then
    raise exception 'approved budget changed: %', payload->'totals'->>'approved_budget_ghs';
  end if;
  if (payload->'totals'->>'ledger_cost_ghs')::numeric <> 1900433.58 then
    raise exception 'ledger total changed: %', payload->'totals'->>'ledger_cost_ghs';
  end if;
  if (payload->'totals'->>'procurement_ghs')::numeric <> 5814700.47 then
    raise exception 'procurement total changed: %', payload->'totals'->>'procurement_ghs';
  end if;
  if (payload->'totals'->>'material_usage_ghs')::numeric <> 2144371.38 then
    raise exception 'material cost changed: %', payload->'totals'->>'material_usage_ghs';
  end if;
  if (payload->'totals'->>'labour_ghs')::numeric <> 273827.18 then
    raise exception 'labour cost changed: %', payload->'totals'->>'labour_ghs';
  end if;
  if (payload->'totals'->>'labour_hours')::numeric <> 4945 then
    raise exception 'labour hours changed: %', payload->'totals'->>'labour_hours';
  end if;
  if (payload->'table_counts'->>'fact_project_cost')::int <> 400
     or (payload->'table_counts'->>'fact_procurement')::int <> 600
     or (payload->'table_counts'->>'fact_material_usage')::int <> 700
     or (payload->'table_counts'->>'fact_labor')::int <> 900 then
    raise exception 'fact row counts changed: %', payload->'table_counts';
  end if;
  if (select count(*) from json_array_elements(payload->'validation') v where v->>'status' = 'PASS') <> 13 then
    raise exception 'expected 13 passing validation checks';
  end if;
  if json_array_length(payload->'rejected') <> 12 then
    raise exception 'expected 12 rejected rows';
  end if;

  set local role anon;

  begin
    perform count(*) from rockshell.fact_project_cost;
    raise exception 'anon was able to read rockshell.fact_project_cost';
  exception
    when insufficient_privilege then
      blocked := sqlerrm;
  end;
  if blocked is null then
    raise exception 'anon table read was not blocked';
  end if;

  payload := public.rockshell_dashboard();
  if (payload->'table_counts'->>'fact_labor')::int <> 900 then
    raise exception 'anon could not read the dashboard RPC';
  end if;

  reset role;
  raise notice 'dashboard API checks passed';
end $$;

rollback;
