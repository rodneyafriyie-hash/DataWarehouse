-- Performance advisor: cover fact_project_cost.date_key FK on its own (composite index leads with project_key).
CREATE INDEX IF NOT EXISTS ix_fpc_date ON rockshell.fact_project_cost (date_key);
ANALYZE rockshell.fact_project_cost;
