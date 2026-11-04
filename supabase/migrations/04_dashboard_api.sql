-- =====================================================================
-- Read-only dashboard API.
-- The only thing exposed to the public (anon) API role is ONE function in the exposed `public`
-- schema that returns the aggregated KPI views as JSON. The raw star tables in `rockshell` keep
-- zero grants for anon/authenticated (and RLS with no policies), and `rockshell` is not an exposed
-- schema, so table rows cannot be read through the Data API.
-- SECURITY DEFINER is needed so the function can read the locked schema; it is STABLE (read-only),
-- has an empty search_path (fully-qualified names only) and returns aggregates, not raw rows.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rockshell_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH r AS (SELECT max(run_id) AS run_id FROM rockshell.etl_run_log WHERE status = 'SUCCESS')
SELECT jsonb_build_object(
  'generated_at', now(),
  'portfolio', (SELECT to_jsonb(v) FROM rockshell.v_portfolio_summary v),
  'projects', (SELECT jsonb_agg(to_jsonb(v) ORDER BY project_id) FROM rockshell.v_project_current v),
  'budget_vs_actual', (SELECT jsonb_agg(to_jsonb(v) ORDER BY project_id) FROM rockshell.v_budget_vs_actual v),
  'budget_by_category', (SELECT jsonb_agg(to_jsonb(v) ORDER BY project_id, cost_category_code) FROM rockshell.v_budget_vs_actual_by_category v),
  'earned_value', (SELECT jsonb_agg(to_jsonb(v) ORDER BY project_id) FROM rockshell.v_earned_value v),
  'supplier_price', (SELECT jsonb_agg(to_jsonb(v) ORDER BY material_id, supplier_id) FROM rockshell.v_supplier_price v),
  'supplier_scorecard', (SELECT jsonb_agg(to_jsonb(v) ORDER BY supplier_id) FROM rockshell.v_supplier_scorecard v),
  'monthly_spend', (SELECT jsonb_agg(jsonb_build_object('p', project_id, 'm', year_month, 'c', cost_category_code, 'v', cost_ghs)
                    ORDER BY year_month, project_id, cost_category_code) FROM rockshell.v_monthly_spend),
  'cost_categories', (SELECT jsonb_agg(jsonb_build_object('code', cost_category_code, 'name', cost_category_name, 'group', cost_group)
                      ORDER BY cost_category_key) FROM rockshell.dim_cost_category),
  'labour_by_month', (SELECT jsonb_agg(jsonb_build_object('p', project_id, 'm', year_month, 'd', department,
                        'hours', hours, 'ot', overtime_hours, 'cost', labour_cost_ghs) ORDER BY year_month, project_id, department)
                      FROM (SELECT project_id, year_month, department, sum(hours) hours, sum(overtime_hours) overtime_hours,
                                   sum(labour_cost_ghs) labour_cost_ghs FROM rockshell.v_labour_cost GROUP BY 1, 2, 3) x),
  'labour_by_role', (SELECT jsonb_agg(to_jsonb(x) ORDER BY labour_cost_ghs DESC)
                     FROM (SELECT department, job_title, sum(hours) hours, sum(overtime_hours) overtime_hours,
                                  sum(labour_cost_ghs) labour_cost_ghs,
                                  (SELECT count(DISTINCT e.employee_id) FROM rockshell.dim_employee e
                                    WHERE e.department = l.department AND e.job_title = l.job_title) AS headcount
                           FROM rockshell.v_labour_cost l GROUP BY 1, 2) x),
  'cost_by_client', (SELECT jsonb_agg(to_jsonb(v) ORDER BY client_id) FROM rockshell.v_cost_by_client v),
  'dq_summary', (SELECT to_jsonb(v) FROM rockshell.v_dq_summary v),
  'dq_source_counts', (SELECT jsonb_agg(to_jsonb(s) - 'run_id' - 'loaded_into' ORDER BY s.raw_rows DESC)
                       FROM rockshell.dq_source_counts s JOIN r USING (run_id)),
  'dq_rules', (SELECT jsonb_agg(jsonb_build_object('source', source, 'rule', rule_code, 'name', rule_name, 'rows', rows_affected,
                 'before', example_before, 'after', example_after) ORDER BY rule_code, source)
               FROM rockshell.dq_issue i JOIN r USING (run_id)),
  'reconciliation', (SELECT jsonb_agg(jsonb_build_object('check', check_name, 'expected', expected, 'actual', actual,
                       'difference', difference, 'status', status) ORDER BY reconciliation_id)
                     FROM rockshell.reconciliation x JOIN r USING (run_id)),
  'etl_runs', (SELECT jsonb_agg(to_jsonb(e) ORDER BY run_id DESC) FROM rockshell.etl_run_log e),
  'star_load_check', (SELECT jsonb_agg(to_jsonb(v)) FROM rockshell.v_star_load_check v),
  'star_counts', (SELECT jsonb_build_object(
       'fact_project_cost', (SELECT count(*) FROM rockshell.fact_project_cost),
       'dim_date', (SELECT count(*) FROM rockshell.dim_date), 'dim_project', (SELECT count(*) FROM rockshell.dim_project),
       'dim_client', (SELECT count(*) FROM rockshell.dim_client), 'dim_supplier', (SELECT count(*) FROM rockshell.dim_supplier),
       'dim_material', (SELECT count(*) FROM rockshell.dim_material), 'dim_cost_category', (SELECT count(*) FROM rockshell.dim_cost_category),
       'dim_employee', (SELECT count(*) FROM rockshell.dim_employee)))
);
$$;

REVOKE ALL ON FUNCTION public.rockshell_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rockshell_dashboard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rockshell_dashboard() TO anon;
COMMENT ON FUNCTION public.rockshell_dashboard() IS 'Read-only aggregated KPI JSON for the Rockshell dashboard (synthetic data).';
NOTIFY pgrst, 'reload schema';
