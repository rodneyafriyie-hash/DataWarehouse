# Verified ledger contract (2026-11-10)

Live database: Supabase project `kthdkdbrokrcokngnfpy`, schema `rockshell`, PostgreSQL 17. The schema is not in the Data API exposed schemas (`public`, `graphql_public` only). `GET /rest/v1/dim_project` with `Accept-Profile: rockshell` returns 406. This dashboard does not expose the schema and does not add grants.

## Read route

`POST /rest/v1/rpc/rockshell_dashboard`

`public.rockshell_dashboard()` is a security invoker wrapper around the existing `rockshell.dashboard_payload()` security definer function (`search_path` empty, unexposed schema). The function body was rewritten in place to read only:

- `dim_project` (12 rows)
- `dim_date` (365 rows, every day of 2025)
- `dim_cost_category` (5 rows)
- `fact_project_cost` (400 rows)

RLS stays on, with no policies and no anon or authenticated table grants. The server key never goes to the browser.

## Payload the page uses

| Part | Fields |
|---|---|
| `projects[]` | `project_id`, `project_name`, `project_type`, `location`, `approved_budget_ghs`, `actual_cost_ghs`, `remaining_budget_ghs`, `pct_budget_used`, `expense_lines` |
| `categories[]` | `category_id`, `category_name`, `actual_cost_ghs`, `expense_lines` |
| `monthly[]` | `year`, `month`, `actual_cost_ghs`, `expense_lines` |
| `totals` | `approved_budget_ghs`, `actual_cost_ghs`, `expense_lines` |
| `table_counts` | the four table names above |
| `quality_checks` | orphan keys, duplicate transaction ids, zero or negative costs |
| also | `design`, `generated_at` |

`client_name` is gone. Suppliers, labour, materials, and the old ETL log are not in the payload.

Budget is aggregated per `project_key` before it is joined to `dim_project`, so each budget is counted once. A project with no expense lines would still appear with `actual_cost_ghs` 0. The verified load has no such project: every one of the 12 has at least 25 lines. `pct_budget_used` is the share of the approved budget recorded in the ledger. It is not percent complete and it is not profit.

Verified totals: approved budget GH₵11,426,147.00, recorded spending GH₵1,900,433.58 (16.6%). Highest share is P005 at 77.5%. Largest category is Utilities at GH₵441,514.65. Peak month is August 2025.

The ETL demonstration on this load is 410 raw rows, 400 accepted, 10 rejected. That replaces the older 403-to-400 story for this simplified star. On the live database a rerun inserts 0 because those 400 expenses are already loaded.
