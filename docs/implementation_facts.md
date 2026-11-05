# Implementation facts for the coursework write-up

Short facts only. The Office documents are edited separately. Do not describe Power BI as part of this repository. It is not implemented here.

- Prototype, synthetic data, calendar year 2025. Not a production system and not a login system.
- Design in force: galaxy / fact constellation. Exactly 4 facts (`fact_project_cost`, `fact_procurement`, `fact_material_usage`, `fact_labor`) and 7 dimensions (`dim_date`, `dim_project`, `dim_client`, `dim_supplier`, `dim_material`, `dim_cost_category`, `dim_employee`).
- Client is reached through project. There is no snowflake beyond that.
- Counts: 400, 600, 700 and 900 facts. 12 rejected source rows (3 per file). 0 foreign-key violations. Validation 13 of 13.
- Approved budget GH₵11,426,147.00. Ledger GH₵1,900,433.58. Purchases GH₵5,814,700.47. Material cost GH₵2,144,371.38. Labour GH₵273,827.18 and 4,945 hours.
- Those four money figures are reported separately. They are not added. Material quantities use 8 units and are not totalled.
- Largest ledger amount is P009 (GH₵217,339.21). Largest share of its own budget is P005 (77.5%). No project is over budget.
- Two equivalent loads: `coursework4/` (Python, SQLite, seed 2026) and `supabase/migrations/01` to `03` (PostgreSQL schema `rockshell` on project kthdkdbrokrcokngnfpy).
- The web page is one responsive page on Cloudflare Pages (`rockshell-dw`) and the same page on the existing Worker. It calls one read-only function, `public.rockshell_dashboard()`. The key is a Cloudflare secret.
- Optional migration `04_private_dashboard_api.sql` moves the security definer body into `rockshell.dashboard_payload()` and leaves a security invoker wrapper under the same public name. It does not change rows. It was not applied by the code change. Run the check script after applying it.
- Row level security stays on. No table policies. `anon` has no table privileges. Schema `rockshell` stays out of the exposed API schemas.
- An earlier single-star design is archived under `archive/star_v1/` and is not the live model.
