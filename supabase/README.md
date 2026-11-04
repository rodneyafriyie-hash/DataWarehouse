# Rockshell International Ltd. – Star-schema warehouse on Supabase

Supabase project `kthdkdbrokrcokngnfpy` (org "Datawarehouse", eu-west-1, PostgreSQL 17), schema **`rockshell`**.
SYNTHETIC DEMO DATA ONLY. The data is the cleaned output (after deduplication) of ETL run #3 from the local system in `../system/`.

![Star ERD](docs/star_erd.png)

## Why a star schema
* **One fact, seven dimensions.** `fact_project_cost` sits in the middle. `dim_date`, `dim_project`, `dim_client`, `dim_supplier`,
  `dim_material`, `dim_cost_category` and `dim_employee` each join straight to it on a surrogate key. No dimension points to
  another dimension, so it is a true star and not a snowflake. Client is a key on the fact, not on the project.
* **Simple, fast queries.** Every KPI is one join away from the fact, which is easy to explain, easy to put in a BI tool and quick to aggregate.
* **Conformed history.** `dim_project` (manager and status) and `dim_employee` (job title and department) are SCD Type 2, so
  each cost row stays linked to the version that was true on the day the cost happened.
* **Unknown / N/A members (key 0)** mean every FK is NOT NULL. A GL overhead line, for example, has supplier 0, material 0 and employee 0.
* `dim_date` also plays the role of expected-delivery and actual-delivery dates on PO rows.

## Fact grain: one project cost transaction line
| record_source | scenario | is_book_of_record | rows | what it is |
|---|---|---|---|---|
| GL | ACTUAL | true | 3,520 | General-ledger cost posting. This is the **book of record** for actual cost (all 5 categories). |
| PO | ACTUAL | false | 1,431 | Purchase-order line, the materials detail: quantity, unit price, on-time flag, days late, price variance |
| PAYROLL | ACTUAL | false | 22,829 | Timesheet line, the labour detail: employee, hours, overtime |
| BUDGET | BUDGET | true | 30 | Approved budget line per project, category and version (`is_current_budget` marks the latest version) |

Money totals (budget vs actual, EVM, trend) add up **book-of-record rows only**, so the PO and payroll detail never double-counts the GL.
Supplier and labour analysis use the PO and PAYROLL rows.

## Views → KPIs
| View | KPI |
|---|---|
| `v_project_current` | Current project attributes and latest % complete |
| `v_budget_vs_actual` | Project cost vs approved budget, remaining budget, % spent |
| `v_budget_vs_actual_by_category` | The same split by cost category |
| `v_earned_value` | BAC, AC, EV, PV, CPI, SPI, EAC, VAC and a Red/Amber/Green cost status |
| `v_supplier_price` | Price per material per supplier vs the standard price and the cheapest supplier, on-time %, days late |
| `v_supplier_scorecard` | One line per supplier: premium range, on-time range, overall on-time % |
| `v_monthly_spend` | Monthly GL spend by project and category (trend) |
| `v_labour_cost` | Labour cost, hours and headcount by project, month, department and job title |
| `v_cost_by_client` | Actual vs budget by client |
| `v_portfolio_summary` | Headline: active projects, total budget, total cost, forecast overrun, projects in Red |
| `v_dq_summary` | Latest ETL run: duplicates removed, IDs recovered, rejected rows, reconciliations passed |
| `v_star_load_check` | Live fact totals per source vs the ETL reconciliation totals (PASS/FAIL) |

Lineage tables, which sit outside the star: `etl_run_log`, `dq_source_counts`, `dq_issue` (cleansing rules R1–R7), `dq_rejected_row`, `reconciliation`.

## Security
* Schema `rockshell` is **not exposed** through the Supabase Data API, and `anon` and `authenticated` have no grants on it.
* RLS is enabled on every table with no policies, so API roles can read nothing. All views are `security_invoker`.
* To let a dashboard read through the API, add `rockshell` to *Exposed schemas* and add read-only policies, or connect with a server-side Postgres connection string.

## Files
* `migrations/01_star_schema.sql`: tables, keys, indexes, RLS
* `migrations/02_kpi_views.sql`: KPI views
* `migrations/03_advisor_fixes.sql`: extra FK index
* `loader/build_batches.py`: extracts the cleaned rows from the local DW and writes batched INSERT files to `data_batches/` (loaded through the Supabase MCP `execute_sql`)
* `loader/source_manifest.json`: source row counts and totals used for verification
* `loader/make_star_erd.py`: draws `docs/star_erd.png`

## Verified in Supabase (queried after load)
* Project A: BAC GH₵5,000,000 · 70% complete · AC GH₵4,200,000 · EV GH₵3,500,000 · CPI 0.833 · EAC GH₵6,000,000 · VAC −GH₵1,000,000 · **Red**
* ABC Building Materials: 5.7–6.2% dearer than the cheapest supplier per material (5.0–9.0% above standard price); on time 31.0–38.0% (34.2% overall)
* Data quality (run 3): 132 duplicates removed · 145 IDs recovered · 32 rows rejected · 5/5 reconciliations PASS
* `v_star_load_check`: GL GH₵22,444,517.19 · PO GH₵9,279,219.57 · Payroll GH₵5,670,935.10 · Budget GH₵37,400,000.00, all PASS (difference 0)

## Not carried into the star (deliberate scope)
Client invoices/revenue (121 rows), weekly material usage (1,124) and the weekly progress history (524) are different business
processes with a different grain. Putting them in the cost fact would break the single grain. The latest % complete is kept in `dim_project`
for EVM. If they are needed later, each becomes its own star sharing the same dimensions, which would make the design a galaxy again.
