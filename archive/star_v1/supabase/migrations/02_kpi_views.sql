-- =====================================================================
-- KPI views over the Rockshell STAR schema. All views are security_invoker so they run with the
-- caller's rights (no SECURITY DEFINER bypass of RLS). Facts point at SCD2 project versions, so
-- views roll up by project_id and show CURRENT project attributes.
-- Rule: money totals use is_book_of_record rows only (GL actuals + budget lines);
--       supplier / labour analysis uses the PO / PAYROLL detail rows.
-- =====================================================================

-- Current project attributes (one row per project)
CREATE OR REPLACE VIEW rockshell.v_project_current WITH (security_invoker = true) AS
SELECT project_id, project_name, project_type, town, region, client_name, project_manager AS current_manager,
       project_status AS current_status, contract_value_ghs, start_date, planned_end_date, actual_end_date,
       planned_pct_complete, actual_pct_complete, progress_as_of
FROM rockshell.dim_project WHERE is_current;

-- KPI 1: project cost vs budget (current approved budget vs GL actual cost)
CREATE OR REPLACE VIEW rockshell.v_budget_vs_actual WITH (security_invoker = true) AS
WITH x AS (
  SELECT p.project_id,
         sum(f.amount_ghs) FILTER (WHERE f.scenario = 'BUDGET' AND f.is_current_budget) AS approved_budget,
         max(f.budget_version) FILTER (WHERE f.scenario = 'BUDGET')                    AS budget_version,
         sum(f.amount_ghs) FILTER (WHERE f.scenario = 'ACTUAL' AND f.is_book_of_record) AS actual_cost
  FROM rockshell.fact_project_cost f JOIN rockshell.dim_project p USING (project_key)
  WHERE f.is_book_of_record GROUP BY p.project_id)
SELECT c.project_id, c.project_name, c.project_type, c.town, c.region, c.client_name, c.current_manager, c.current_status,
       x.approved_budget, x.budget_version, COALESCE(x.actual_cost, 0) AS actual_cost,
       x.approved_budget - COALESCE(x.actual_cost, 0) AS budget_remaining,
       round(100 * COALESCE(x.actual_cost, 0) / NULLIF(x.approved_budget, 0), 1) AS pct_budget_spent
FROM rockshell.v_project_current c JOIN x USING (project_id);

-- KPI 1b: cost vs budget by cost category
CREATE OR REPLACE VIEW rockshell.v_budget_vs_actual_by_category WITH (security_invoker = true) AS
SELECT p.project_id, cc.cost_category_code, cc.cost_category_name, cc.cost_group,
       sum(f.amount_ghs) FILTER (WHERE f.scenario = 'BUDGET' AND f.is_current_budget) AS budget_amount,
       COALESCE(sum(f.amount_ghs) FILTER (WHERE f.scenario = 'ACTUAL'), 0)            AS actual_cost,
       round(100 * COALESCE(sum(f.amount_ghs) FILTER (WHERE f.scenario = 'ACTUAL'), 0)
             / NULLIF(sum(f.amount_ghs) FILTER (WHERE f.scenario = 'BUDGET' AND f.is_current_budget), 0), 1) AS pct_spent
FROM rockshell.fact_project_cost f
JOIN rockshell.dim_project p USING (project_key)
JOIN rockshell.dim_cost_category cc USING (cost_category_key)
WHERE f.is_book_of_record
GROUP BY 1, 2, 3, 4;

-- KPI 2: earned value. BAC = latest budget version in force at the progress date;
-- AC = all GL cost posted to date; EV = BAC x % complete; CPI = EV/AC; EAC = BAC/CPI; VAC = BAC - EAC.
CREATE OR REPLACE VIEW rockshell.v_earned_value WITH (security_invoker = true) AS
WITH c AS (SELECT * FROM rockshell.v_project_current),
bud AS (
  SELECT DISTINCT ON (p.project_id, f.cost_category_key) p.project_id, f.amount_ghs
  FROM rockshell.fact_project_cost f
  JOIN rockshell.dim_project p USING (project_key)
  JOIN rockshell.dim_date d ON d.date_key = f.date_key
  JOIN c ON c.project_id = p.project_id
  WHERE f.scenario = 'BUDGET' AND d.full_date <= c.progress_as_of
  ORDER BY p.project_id, f.cost_category_key, f.budget_version DESC),
bac AS (SELECT project_id, sum(amount_ghs) AS bac FROM bud GROUP BY 1),
ac AS (SELECT p.project_id, sum(f.amount_ghs) AS ac
       FROM rockshell.fact_project_cost f JOIN rockshell.dim_project p USING (project_key)
       WHERE f.scenario = 'ACTUAL' AND f.is_book_of_record GROUP BY 1),
m AS (SELECT c.project_id, c.project_name, c.progress_as_of, c.planned_pct_complete, c.actual_pct_complete, bac.bac, ac.ac,
             bac.bac * c.actual_pct_complete / 100  AS ev,
             bac.bac * c.planned_pct_complete / 100 AS pv
      FROM c JOIN bac USING (project_id) JOIN ac USING (project_id))
SELECT project_id, project_name, progress_as_of AS as_of_week, planned_pct_complete, actual_pct_complete,
       round(bac, 2) AS bac, round(ac, 2) AS ac, round(ev, 2) AS ev, round(pv, 2) AS pv,
       round(ev / NULLIF(ac, 0), 3)                                   AS cpi,
       round(actual_pct_complete / NULLIF(planned_pct_complete, 0), 3) AS spi,
       round(bac / NULLIF(ev / NULLIF(ac, 0), 0), 2)                  AS eac,
       round(bac - bac / NULLIF(ev / NULLIF(ac, 0), 0), 2)            AS vac,
       CASE WHEN ev / NULLIF(ac, 0) < 0.90 THEN 'Red'
            WHEN ev / NULLIF(ac, 0) < 0.97 THEN 'Amber' ELSE 'Green' END AS cost_status
FROM m;

-- KPI 3: supplier price & on-time comparison per material (PO detail rows)
CREATE OR REPLACE VIEW rockshell.v_supplier_price WITH (security_invoker = true) AS
WITH s AS (
  SELECT m.material_id, m.material_name, m.standard_unit, m.standard_price_ghs, sp.supplier_id, sp.supplier_name,
         count(*) AS po_lines, sum(f.quantity) AS quantity, sum(f.amount_ghs) AS spend,
         sum(f.amount_ghs) / NULLIF(sum(f.quantity), 0) AS avg_unit_price,
         avg(CASE WHEN f.on_time_flag THEN 1.0 ELSE 0.0 END) AS on_time_rate,
         avg(f.days_late) AS avg_days_late, sum(f.price_variance_ghs) AS price_variance_ghs
  FROM rockshell.fact_project_cost f
  JOIN rockshell.dim_material m USING (material_key)
  JOIN rockshell.dim_supplier sp USING (supplier_key)
  WHERE f.record_source = 'PO'
  GROUP BY 1, 2, 3, 4, 5, 6)
SELECT material_id, material_name, standard_unit, supplier_id, supplier_name, po_lines,
       round(quantity, 1) AS quantity, round(spend, 2) AS spend, round(avg_unit_price, 4) AS avg_unit_price,
       standard_price_ghs,
       round(100 * (avg_unit_price / NULLIF(standard_price_ghs, 0) - 1), 1) AS pct_vs_standard,
       round(100 * (avg_unit_price / NULLIF(min(avg_unit_price) OVER (PARTITION BY material_id), 0) - 1), 1) AS pct_vs_cheapest,
       round(100 * on_time_rate, 1) AS on_time_pct, round(avg_days_late, 1) AS avg_days_late,
       round(price_variance_ghs, 2) AS price_variance_vs_standard_ghs
FROM s;

-- KPI 3b: one-line supplier scorecard
CREATE OR REPLACE VIEW rockshell.v_supplier_scorecard WITH (security_invoker = true) AS
SELECT supplier_id, supplier_name, count(DISTINCT material_id) AS materials, sum(po_lines) AS po_lines, sum(spend) AS spend,
       min(pct_vs_cheapest) AS min_pct_vs_cheapest, max(pct_vs_cheapest) AS max_pct_vs_cheapest,
       min(on_time_pct) AS min_on_time_pct, max(on_time_pct) AS max_on_time_pct,
       round(sum(on_time_pct * po_lines) / sum(po_lines), 1) AS overall_on_time_pct
FROM rockshell.v_supplier_price GROUP BY 1, 2;

-- KPI 4: monthly spend trend (GL actuals) by project and category
CREATE OR REPLACE VIEW rockshell.v_monthly_spend WITH (security_invoker = true) AS
SELECT p.project_id, d.year_month, d.year, d.month_number, cc.cost_category_code, cc.cost_category_name,
       sum(f.amount_ghs) AS cost_ghs, count(*) AS postings
FROM rockshell.fact_project_cost f
JOIN rockshell.dim_project p USING (project_key)
JOIN rockshell.dim_date d USING (date_key)
JOIN rockshell.dim_cost_category cc USING (cost_category_key)
WHERE f.scenario = 'ACTUAL' AND f.is_book_of_record
GROUP BY 1, 2, 3, 4, 5, 6;

-- KPI 5: labour cost and hours (PAYROLL detail rows)
CREATE OR REPLACE VIEW rockshell.v_labour_cost WITH (security_invoker = true) AS
SELECT p.project_id, d.year_month, e.department, e.job_title,
       count(DISTINCT e.employee_id) AS headcount, sum(f.hours) AS hours, sum(f.overtime_hours) AS overtime_hours,
       sum(f.amount_ghs) AS labour_cost_ghs
FROM rockshell.fact_project_cost f
JOIN rockshell.dim_project p USING (project_key)
JOIN rockshell.dim_date d USING (date_key)
JOIN rockshell.dim_employee e USING (employee_key)
WHERE f.record_source = 'PAYROLL'
GROUP BY 1, 2, 3, 4;

-- Cost by client (direct star join on client_key)
CREATE OR REPLACE VIEW rockshell.v_cost_by_client WITH (security_invoker = true) AS
SELECT cl.client_id, cl.client_name, cl.client_type, cl.region,
       sum(f.amount_ghs) FILTER (WHERE f.scenario = 'ACTUAL') AS actual_cost,
       sum(f.amount_ghs) FILTER (WHERE f.scenario = 'BUDGET' AND f.is_current_budget) AS approved_budget
FROM rockshell.fact_project_cost f JOIN rockshell.dim_client cl USING (client_key)
WHERE f.is_book_of_record GROUP BY 1, 2, 3, 4;

-- Portfolio headline
CREATE OR REPLACE VIEW rockshell.v_portfolio_summary WITH (security_invoker = true) AS
SELECT (SELECT count(*) FROM rockshell.v_project_current WHERE current_status = 'Active') AS active_projects,
       (SELECT sum(approved_budget) FROM rockshell.v_budget_vs_actual) AS total_budget,
       (SELECT sum(actual_cost) FROM rockshell.v_budget_vs_actual)     AS total_actual_cost,
       (SELECT sum(GREATEST(-vac, 0)) FROM rockshell.v_earned_value)   AS forecast_overrun,
       (SELECT count(*) FROM rockshell.v_earned_value WHERE cost_status = 'Red') AS projects_red;

-- Data quality: latest ETL run headline
CREATE OR REPLACE VIEW rockshell.v_dq_summary WITH (security_invoker = true) AS
WITH r AS (SELECT max(run_id) AS run_id FROM rockshell.etl_run_log WHERE status = 'SUCCESS')
SELECT r.run_id,
       (SELECT sum(raw_rows) FROM rockshell.dq_source_counts s WHERE s.run_id = r.run_id)           AS raw_rows,
       (SELECT sum(duplicates_removed) FROM rockshell.dq_source_counts s WHERE s.run_id = r.run_id) AS duplicates_removed,
       (SELECT sum(ids_recovered) FROM rockshell.dq_source_counts s WHERE s.run_id = r.run_id)      AS ids_recovered,
       (SELECT sum(rejected) FROM rockshell.dq_source_counts s WHERE s.run_id = r.run_id)           AS rows_rejected,
       (SELECT count(*) FILTER (WHERE status = 'PASS') FROM rockshell.reconciliation x WHERE x.run_id = r.run_id) AS reconciliations_pass,
       (SELECT count(*) FILTER (WHERE status IN ('PASS','FAIL')) FROM rockshell.reconciliation x WHERE x.run_id = r.run_id) AS reconciliations_total
FROM r;

-- Star load check: live fact totals vs the source ETL reconciliation (latest run)
CREATE OR REPLACE VIEW rockshell.v_star_load_check WITH (security_invoker = true) AS
WITH r AS (SELECT max(run_id) AS run_id FROM rockshell.etl_run_log WHERE status = 'SUCCESS'),
src AS (SELECT x.check_name, x.actual AS source_total FROM rockshell.reconciliation x JOIN r USING (run_id) WHERE x.status = 'PASS'),
star AS (SELECT record_source, count(*) AS rows_in_star, sum(amount_ghs) AS star_total FROM rockshell.fact_project_cost GROUP BY 1),
m(record_source, check_prefix) AS (VALUES ('GL','GL:'), ('PO','Procurement:'), ('PAYROLL','Payroll:'), ('BUDGET','Budgets:'))
SELECT m.record_source, star.rows_in_star, src.source_total, star.star_total, star.star_total - src.source_total AS difference,
       CASE WHEN star.star_total = src.source_total THEN 'PASS' ELSE 'FAIL' END AS status
FROM m JOIN star USING (record_source) JOIN src ON src.check_name LIKE m.check_prefix || '%';

REVOKE ALL ON ALL TABLES IN SCHEMA rockshell FROM anon, authenticated;
