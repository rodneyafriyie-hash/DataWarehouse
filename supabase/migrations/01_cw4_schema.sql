-- Rockshell Coursework 4: PostgreSQL port of coursework4/schema.sql (fact constellation:
-- 4 fact tables sharing 7 conformed dimensions) + ETL / data-quality metadata tables.
-- Replaces the earlier single-star design (backup kept outside the database).
drop function if exists public.rockshell_dashboard();
drop schema if exists rockshell cascade;
create schema rockshell;
revoke all on schema rockshell from public, anon, authenticated;

create table rockshell.dim_client(client_key integer primary key, client_id text unique not null, client_name text not null);
create table rockshell.dim_project(project_key integer primary key, project_id text unique not null, project_name text not null, project_type text, location text,
  client_key integer not null references rockshell.dim_client(client_key), approved_budget_ghs numeric(14,2) not null check (approved_budget_ghs >= 0));
create table rockshell.dim_supplier(supplier_key integer primary key, supplier_id text unique not null, supplier_name text not null);
create table rockshell.dim_material(material_key integer primary key, material_id text unique not null, material_name text not null, unit text not null);
create table rockshell.dim_employee(employee_key integer primary key, employee_id text unique not null, employee_name text not null, job_title text not null);
create table rockshell.dim_cost_category(category_key integer primary key, category_id text unique not null, category_name text not null);
create table rockshell.dim_date(date_key integer primary key, full_date date unique not null, day integer not null, month integer not null, quarter integer not null, year integer not null);

create table rockshell.fact_project_cost(cost_key integer primary key, transaction_id text unique not null,
  project_key integer not null references rockshell.dim_project(project_key), date_key integer not null references rockshell.dim_date(date_key),
  category_key integer not null references rockshell.dim_cost_category(category_key), actual_cost_ghs numeric(14,2) not null check (actual_cost_ghs >= 0));
create table rockshell.fact_procurement(procurement_key integer primary key, purchase_line_id text unique not null,
  project_key integer not null references rockshell.dim_project(project_key), date_key integer not null references rockshell.dim_date(date_key),
  supplier_key integer not null references rockshell.dim_supplier(supplier_key), material_key integer not null references rockshell.dim_material(material_key),
  quantity numeric(14,2) not null check (quantity > 0), unit_price_ghs numeric(14,2) not null check (unit_price_ghs >= 0), purchase_cost_ghs numeric(14,2) not null check (purchase_cost_ghs >= 0));
create table rockshell.fact_material_usage(usage_key integer primary key, usage_id text unique not null,
  project_key integer not null references rockshell.dim_project(project_key), date_key integer not null references rockshell.dim_date(date_key),
  material_key integer not null references rockshell.dim_material(material_key),
  quantity_used numeric(14,2) not null check (quantity_used > 0), unit_cost_ghs numeric(14,2) not null check (unit_cost_ghs >= 0), total_material_cost_ghs numeric(14,2) not null check (total_material_cost_ghs >= 0));
create table rockshell.fact_labor(labor_key integer primary key, labor_entry_id text unique not null,
  project_key integer not null references rockshell.dim_project(project_key), date_key integer not null references rockshell.dim_date(date_key),
  employee_key integer not null references rockshell.dim_employee(employee_key),
  hours_worked numeric(14,2) not null check (hours_worked > 0), hourly_rate_ghs numeric(14,2) not null check (hourly_rate_ghs >= 0), labor_cost_ghs numeric(14,2) not null check (labor_cost_ghs >= 0));

-- foreign-key indexes (Coursework 4 section 5.1)
create index on rockshell.dim_project(client_key);
create index on rockshell.fact_project_cost(project_key); create index on rockshell.fact_project_cost(date_key); create index on rockshell.fact_project_cost(category_key);
create index on rockshell.fact_procurement(project_key); create index on rockshell.fact_procurement(date_key); create index on rockshell.fact_procurement(supplier_key); create index on rockshell.fact_procurement(material_key);
create index on rockshell.fact_material_usage(project_key); create index on rockshell.fact_material_usage(date_key); create index on rockshell.fact_material_usage(material_key);
create index on rockshell.fact_labor(project_key); create index on rockshell.fact_labor(date_key); create index on rockshell.fact_labor(employee_key);

-- ETL and data-quality metadata (run log, rejected rows, validation checks)
create table rockshell.etl_run_log(run_id integer primary key, run_label text not null, source_system text, loaded_at timestamptz not null default now(), notes text);
create table rockshell.etl_load_stats(run_id integer references rockshell.etl_run_log(run_id), fact_table text, source_file text not null,
  raw_rows integer not null, loaded_rows integer not null, rejected_rows integer not null, primary key(run_id, fact_table));
create table rockshell.dq_rejected_record(rejected_id integer generated always as identity primary key, run_id integer references rockshell.etl_run_log(run_id),
  source_file text not null, source_identifier text, rejection_reason text not null);
create table rockshell.validation_expected(run_id integer references rockshell.etl_run_log(run_id), check_name text, expected numeric not null, primary key(run_id, check_name));
create index on rockshell.etl_load_stats(run_id); create index on rockshell.dq_rejected_record(run_id); create index on rockshell.validation_expected(run_id);

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'rockshell' loop
    execute format('alter table rockshell.%I enable row level security', t);
    execute format('revoke all on rockshell.%I from anon, authenticated', t);
  end loop; end $$;
