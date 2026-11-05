# Data dictionary (Coursework 4 galaxy)

Synthetic coursework prototype for Rockshell International Ltd. These tables are the warehouse. They are not a production system, and this repository does not include a Power BI report.

The shape is a fact constellation: **4 fact tables** and **7 dimension tables**. Client is a dimension, but facts do not point at client directly. They point at project, and project points at client.

Currency is Ghana cedis (GH₵), stored as decimal money. Hours are hours. Material quantities keep the unit from `dim_material` and are not added across units.

## Facts (what one row means)

| Table | Grain (one row) | Rows | Measures | Foreign keys |
|---|---|---|---|---|
| fact_project_cost | One ledger cost transaction | 400 | actual_cost_ghs | project, date, cost category |
| fact_procurement | One purchase line | 600 | quantity, unit_price_ghs, purchase_cost_ghs | project, date, supplier, material |
| fact_material_usage | One site material-usage entry | 700 | quantity_used, unit_cost_ghs, total_material_cost_ghs | project, date, material |
| fact_labor | One employee work entry for one project and date | 900 | hours_worked, hourly_rate_ghs, labor_cost_ghs | project, date, employee |

The table name is `fact_labor` (US spelling in the schema). The source file is `labour_raw.csv`. The dashboard says "Labour" for the same subject.

Do not add ledger cost, purchase cost, material cost and labour cost. Procurement, usage and labour can describe the same work that the ledger has already recorded. The analysis query in `coursework4/analysis_queries.sql` says the same thing.

## Dimensions

| Table | Rows | Business key | What it describes |
|---|---|---|---|
| dim_date | 365 | full_date | Calendar days in 2025. date_key is YYYYMMDD. |
| dim_project | 12 | project_id (P001 to P012) | Project name, type, location, client_key, approved_budget_ghs |
| dim_client | 8 | client_id | Client name. Linked only from dim_project. |
| dim_supplier | 12 | supplier_id | Supplier name |
| dim_material | 15 | material_id | Material name and unit (bag, tonne, litre, metre, piece, sheet, box, sqm) |
| dim_cost_category | 5 | category_id | Equipment, Transport, Utilities, Site Administration, Permits |
| dim_employee | 40 | employee_id | Employee name and job title |

Surrogate keys are integers. Business keys are unique. Every fact foreign key is `NOT NULL` and references the dimension primary key.

## Column notes

Money columns use `numeric(14,2)` on PostgreSQL and `REAL` on the SQLite copy, with a check that money is zero or positive. Quantity and hours must be greater than zero. `purchase_cost_ghs` and `total_material_cost_ghs` are quantity times price, rounded to 2 decimals, calculated by the loader.

`dim_project.approved_budget_ghs` is the approved budget. It is not a fact. Budget versus recorded spending uses this column against `sum(fact_project_cost.actual_cost_ghs)`.

## Relationships

- dim_client 1 to many dim_project (client_key).
- dim_project, dim_date and dim_cost_category 1 to many fact_project_cost.
- dim_project, dim_date, dim_supplier and dim_material 1 to many fact_procurement.
- dim_project, dim_date and dim_material 1 to many fact_material_usage.
- dim_project, dim_date and dim_employee 1 to many fact_labor.

There is no snowflake beyond client to project. The picture is `docs/schema.svg`.

## How a row gets in (validation)

`coursework4/build_warehouse.py` writes the synthetic CSV files with random seed 2026, including 3 bad rows in each fact file. The loader keeps a row only when all of these hold:

- the source id is present and not a duplicate in that file
- the business keys exist in the dimension files
- the date is a real date in 2025 (the date dimension covers the year)
- money is not negative
- quantity and hours are greater than zero

Rejected rows (12 in total, 3 per file):

| File | Id | Reason |
|---|---|---|
| finance_raw.csv | FC00013 | duplicate source id |
| finance_raw.csv | FC99998 | unknown project P999 |
| finance_raw.csv | FC99999 | negative actual cost |
| procurement_raw.csv | PO00022 | duplicate source id |
| procurement_raw.csv | PO99998 | invalid date |
| procurement_raw.csv | PO99999 | quantity is not positive |
| usage_raw.csv | MU00004 | duplicate source id |
| usage_raw.csv | MU99998 | unknown material M777 |
| usage_raw.csv | MU99999 | quantity is not positive |
| labour_raw.csv | LB00008 | duplicate source id |
| labour_raw.csv | LB99998 | unknown employee E999 |
| labour_raw.csv | LB99999 | hours are not positive |

Raw to loaded: finance 403 to 400, procurement 603 to 600, usage 703 to 700, labour 903 to 900. Foreign-key violations after the load: 0.

PostgreSQL also enforces the same rules with foreign keys and CHECK constraints, so a bad row cannot be inserted later by accident. Those checks do not change the 2,600 loaded facts.

## Checks stored with the load

These tables are metadata, not a fifth fact:

| Table | What it stores |
|---|---|
| etl_run_log | One coursework build row |
| etl_load_stats | Raw, loaded and rejected counts per fact |
| dq_rejected_record | The 12 rejected source rows and reasons |
| validation_expected | The 13 expected numbers from `coursework4/outputs/validation.json` |

`rockshell.v_validation` compares those 13 expected numbers with the live tables. The hosted copy reports 13 of 13 PASS.

## Views the dashboard uses

All views are `security_invoker = true` (they do not bypass row level security on their own).

| View | Grain of the result |
|---|---|
| v_project_budget_vs_ledger | One project: budget, ledger cost, budget minus ledger |
| v_supplier_purchases | One supplier: purchase cost. Not ledger cost. |
| v_project_labour | One project: hours and labour cost |
| v_material_usage | One material: quantity in that material's unit, and cost in cedis |
| v_monthly_by_subject | One subject and month. Subjects are not stacked into one total. |
| v_table_counts | One row per warehouse table |
| v_validation | One check: expected, actual, PASS or FAIL |

## Verified totals (do not restate these as one combined cost)

| Subject | Figure | Compared with |
|---|---|---|
| Approved budget | GH₵11,426,147.00 | the ledger only |
| Recorded ledger spending | GH₵1,900,433.58 | the approved budget (16.6% of it) |
| Purchases | GH₵5,814,700.47 | nothing on this page. Separate subject. |
| Material cost | GH₵2,144,371.38 | nothing on this page. Quantities stay in their units. |
| Labour cost | GH₵273,827.18 | nothing on this page. |
| Labour hours | 4,945 | not added to cedis |

Largest ledger amount: P009, GH₵217,339.21 of a GH₵777,461.00 budget. Largest share of a project's own budget: P005, 77.5% (GH₵197,866.56 of GH₵255,315.00). No project is over budget.

Indexes already cover each foreign-key column. No further index is required for this prototype (2,600 fact rows).
