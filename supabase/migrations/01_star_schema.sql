-- =====================================================================
-- Rockshell International Ltd. - STAR schema data warehouse (Supabase / PostgreSQL 17)
-- One central fact table (fact_project_cost) surrounded by 7 denormalised dimensions.
-- No snowflaking: every dimension joins DIRECTLY to the fact; no dimension references another.
-- Schema `rockshell` is NOT exposed through the Supabase Data API; RLS is enabled on every
-- table with no policies, so anon/authenticated API roles can read nothing.
-- SYNTHETIC DEMO DATA ONLY.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS rockshell;
COMMENT ON SCHEMA rockshell IS 'Rockshell DW - star schema (SYNTHETIC DEMO DATA ONLY)';

-- ---------------------------------------------------------------- dimensions
CREATE TABLE rockshell.dim_date (
  date_key      INT PRIMARY KEY,               -- yyyymmdd ; 0 = not applicable
  full_date     DATE UNIQUE,
  day_of_week   SMALLINT,                      -- 1 = Monday
  day_name      VARCHAR(10),
  week_of_year  SMALLINT,
  month_number  SMALLINT,
  month_name    VARCHAR(10),
  year_month    CHAR(7),
  quarter       SMALLINT,
  year          SMALLINT,
  is_weekend    BOOLEAN
);

CREATE TABLE rockshell.dim_client (
  client_key   INT PRIMARY KEY,                -- 0 = unknown
  client_id    VARCHAR(20) NOT NULL UNIQUE,
  client_name  VARCHAR(150) NOT NULL,
  client_type  VARCHAR(30),
  region       VARCHAR(60)
);

-- SCD Type 2 on project_manager / project_status. Latest site-progress figures are carried as
-- Type 1 attributes (same value on every version) so earned value needs no second fact table.
CREATE TABLE rockshell.dim_project (
  project_key            INT PRIMARY KEY,
  project_id             VARCHAR(20) NOT NULL,
  project_name           VARCHAR(150) NOT NULL,
  project_type           VARCHAR(30),
  town                   VARCHAR(80),
  region                 VARCHAR(60),
  client_name            VARCHAR(150),         -- denormalised (descriptive only; client_key lives on the fact)
  project_manager        VARCHAR(120),
  project_status         VARCHAR(20),
  contract_value_ghs     NUMERIC(16,2),
  start_date             DATE,
  planned_end_date       DATE,
  actual_end_date        DATE,
  planned_pct_complete   NUMERIC(5,2),         -- latest weekly site report (Type 1)
  actual_pct_complete    NUMERIC(5,2),
  progress_as_of         DATE,
  valid_from             DATE NOT NULL,
  valid_to               DATE NOT NULL DEFAULT DATE '9999-12-31',
  is_current             BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (project_id, valid_from)
);

CREATE TABLE rockshell.dim_supplier (
  supplier_key   INT PRIMARY KEY,              -- 0 = not applicable
  supplier_id    VARCHAR(20) NOT NULL UNIQUE,
  supplier_name  VARCHAR(150) NOT NULL,
  supplier_type  VARCHAR(40),
  town           VARCHAR(80)
);

CREATE TABLE rockshell.dim_material (
  material_key        INT PRIMARY KEY,         -- 0 = not applicable
  material_id         VARCHAR(20) NOT NULL UNIQUE,
  material_name       VARCHAR(120) NOT NULL,
  material_category   VARCHAR(60),
  standard_unit       VARCHAR(10),
  standard_price_ghs  NUMERIC(14,4)
);

CREATE TABLE rockshell.dim_cost_category (
  cost_category_key   INT PRIMARY KEY,
  cost_category_code  VARCHAR(10) NOT NULL UNIQUE,
  cost_category_name  VARCHAR(60) NOT NULL,
  cost_group          VARCHAR(20) NOT NULL     -- Direct / Indirect
);

-- SCD Type 2 on job_title / department
CREATE TABLE rockshell.dim_employee (
  employee_key     INT PRIMARY KEY,            -- 0 = not applicable
  employee_id      VARCHAR(20) NOT NULL,
  employee_name    VARCHAR(120) NOT NULL,
  job_title        VARCHAR(80),
  department       VARCHAR(60),
  employment_type  VARCHAR(30),
  valid_from       DATE NOT NULL,
  valid_to         DATE NOT NULL DEFAULT DATE '9999-12-31',
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (employee_id, valid_from)
);

-- ---------------------------------------------------------------- the ONE fact table
-- Grain: one project cost transaction line.
--   record_source = 'GL'      general-ledger cost posting   (book of record for ACTUAL cost)
--                 = 'PO'      purchase-order line           (materials sub-ledger detail)
--                 = 'PAYROLL' timesheet line                (labour sub-ledger detail)
--                 = 'BUDGET'  approved budget line          (scenario BUDGET)
--   is_book_of_record = TRUE for GL and BUDGET rows. Totals (budget vs actual, EVM, trend) sum only
--   book-of-record rows, so PO/PAYROLL detail never double-counts the GL. Supplier and labour
--   analysis read the PO/PAYROLL rows for the quantity / price / hours / delivery measures.
CREATE TABLE rockshell.fact_project_cost (
  cost_txn_key               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_key                   INT NOT NULL REFERENCES rockshell.dim_date(date_key),
  project_key                INT NOT NULL REFERENCES rockshell.dim_project(project_key),
  client_key                 INT NOT NULL REFERENCES rockshell.dim_client(client_key),
  cost_category_key          INT NOT NULL REFERENCES rockshell.dim_cost_category(cost_category_key),
  supplier_key               INT NOT NULL DEFAULT 0 REFERENCES rockshell.dim_supplier(supplier_key),
  material_key               INT NOT NULL DEFAULT 0 REFERENCES rockshell.dim_material(material_key),
  employee_key               INT NOT NULL DEFAULT 0 REFERENCES rockshell.dim_employee(employee_key),
  expected_delivery_date_key INT NOT NULL DEFAULT 0 REFERENCES rockshell.dim_date(date_key),  -- role-playing date
  actual_delivery_date_key   INT NOT NULL DEFAULT 0 REFERENCES rockshell.dim_date(date_key),  -- role-playing date
  scenario                   VARCHAR(10) NOT NULL CHECK (scenario IN ('ACTUAL','BUDGET')),
  record_source              VARCHAR(10) NOT NULL CHECK (record_source IN ('GL','PO','PAYROLL','BUDGET')),
  is_book_of_record          BOOLEAN NOT NULL,
  source_doc_no              VARCHAR(40) NOT NULL,      -- degenerate dimension (GL doc / PO-line / timesheet / budget id)
  budget_version             SMALLINT,
  is_current_budget          BOOLEAN,
  amount_ghs                 NUMERIC(16,2) NOT NULL,
  quantity                   NUMERIC(14,3),             -- PO: quantity in material standard unit
  unit_price_ghs             NUMERIC(14,4),             -- PO: GH₵ per standard unit
  hours                      NUMERIC(6,2),              -- PAYROLL: normal hours
  overtime_hours             NUMERIC(6,2),              -- PAYROLL: overtime hours
  days_late                  INT,                       -- PO: actual - expected delivery (days)
  on_time_flag               BOOLEAN,                   -- PO: delivered on/before expected date
  price_variance_pct         NUMERIC(8,2),              -- PO: % above (+) / below (-) standard price
  price_variance_ghs         NUMERIC(16,2),             -- PO: (unit price - standard price) * quantity
  UNIQUE (record_source, source_doc_no),
  CHECK (is_book_of_record = (record_source IN ('GL','BUDGET'))),
  CHECK ((scenario = 'BUDGET') = (record_source = 'BUDGET'))
);
CREATE INDEX ix_fpc_project_date ON rockshell.fact_project_cost (project_key, date_key);
CREATE INDEX ix_fpc_category     ON rockshell.fact_project_cost (cost_category_key);
CREATE INDEX ix_fpc_client       ON rockshell.fact_project_cost (client_key);
CREATE INDEX ix_fpc_supplier     ON rockshell.fact_project_cost (supplier_key);
CREATE INDEX ix_fpc_material     ON rockshell.fact_project_cost (material_key);
CREATE INDEX ix_fpc_employee     ON rockshell.fact_project_cost (employee_key);
CREATE INDEX ix_fpc_exp_del      ON rockshell.fact_project_cost (expected_delivery_date_key);
CREATE INDEX ix_fpc_act_del      ON rockshell.fact_project_cost (actual_delivery_date_key);
CREATE INDEX ix_fpc_source       ON rockshell.fact_project_cost (record_source, scenario);
CREATE INDEX ix_dim_project_id   ON rockshell.dim_project (project_id, is_current);
CREATE INDEX ix_dim_employee_id  ON rockshell.dim_employee (employee_id, is_current);

-- ---------------------------------------------------------------- lineage / data quality (not part of the star)
CREATE TABLE rockshell.etl_run_log (
  run_id        BIGINT PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  status        VARCHAR(12) NOT NULL,
  triggered_by  VARCHAR(60),
  notes         TEXT
);
CREATE TABLE rockshell.dq_source_counts (
  run_id             BIGINT NOT NULL REFERENCES rockshell.etl_run_log(run_id),
  source             TEXT NOT NULL,
  raw_rows           INT,
  duplicates_removed INT,
  ids_recovered      INT,
  rejected           INT,
  clean_rows         INT,
  loaded_into        TEXT,                    -- galaxy table name in the source system
  PRIMARY KEY (run_id, source)
);
CREATE TABLE rockshell.dq_issue (               -- cleansing-rule log (R1-R7) per run
  dq_issue_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES rockshell.etl_run_log(run_id),
  source          VARCHAR(60) NOT NULL,
  rule_code       VARCHAR(10) NOT NULL,
  rule_name       VARCHAR(120) NOT NULL,
  rows_affected   INT NOT NULL,
  example_before  TEXT,
  example_after   TEXT
);
CREATE TABLE rockshell.dq_rejected_row (
  rejected_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id       BIGINT NOT NULL REFERENCES rockshell.etl_run_log(run_id),
  source       VARCHAR(60) NOT NULL,
  source_row   INT,
  reason       VARCHAR(200) NOT NULL,
  raw_record   TEXT
);
CREATE TABLE rockshell.reconciliation (
  reconciliation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id      BIGINT NOT NULL REFERENCES rockshell.etl_run_log(run_id),
  check_name  VARCHAR(160) NOT NULL,
  expected    NUMERIC(18,2),
  actual      NUMERIC(18,2),
  difference  NUMERIC(18,2),
  status      VARCHAR(10) NOT NULL
);
CREATE INDEX ix_dq_src_run ON rockshell.dq_source_counts (run_id);
CREATE INDEX ix_dq_issue_run ON rockshell.dq_issue (run_id);
CREATE INDEX ix_dq_rej_run ON rockshell.dq_rejected_row (run_id);
CREATE INDEX ix_recon_run ON rockshell.reconciliation (run_id);

-- ---------------------------------------------------------------- security
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'rockshell' LOOP
    EXECUTE format('ALTER TABLE rockshell.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA rockshell FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA rockshell FROM anon, authenticated;
