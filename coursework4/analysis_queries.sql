-- Report separately: these cost datasets may overlap; do NOT add them without financial reconciliation.
SELECT p.project_id,p.project_name,ROUND(p.approved_budget_ghs,2) AS approved_budget_ghs,ROUND(COALESCE(SUM(c.actual_cost_ghs),0),2) AS ledger_cost_ghs,ROUND(p.approved_budget_ghs-COALESCE(SUM(c.actual_cost_ghs),0),2) AS budget_less_ledger_cost_ghs FROM dim_project p LEFT JOIN fact_project_cost c ON c.project_key=p.project_key GROUP BY p.project_key ORDER BY ledger_cost_ghs DESC;

SELECT s.supplier_name,ROUND(SUM(f.purchase_cost_ghs),2) AS purchase_total_ghs FROM fact_procurement f JOIN dim_supplier s ON s.supplier_key=f.supplier_key GROUP BY s.supplier_key ORDER BY purchase_total_ghs DESC LIMIT 5;

SELECT p.project_name,ROUND(SUM(l.hours_worked),2) AS hours, ROUND(SUM(l.labor_cost_ghs),2) AS labor_cost_ghs FROM fact_labor l JOIN dim_project p ON p.project_key=l.project_key GROUP BY p.project_key ORDER BY labor_cost_ghs DESC LIMIT 5;
