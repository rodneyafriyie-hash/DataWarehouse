"""Draw the star-schema ERD (docs/star_erd.png) for the rockshell schema in Supabase."""
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
NAVY, ORANGE, GREY = "#1f2a44", "#f28c28", "#f4f6fa"
fact = ("fact_project_cost", ["PK cost_txn_key", "FK date_key", "FK project_key", "FK client_key", "FK cost_category_key",
        "FK supplier_key", "FK material_key", "FK employee_key", "FK expected_delivery_date_key", "FK actual_delivery_date_key",
        "scenario (ACTUAL / BUDGET)", "record_source (GL/PO/PAYROLL/BUDGET)", "is_book_of_record", "source_doc_no (degenerate)",
        "budget_version, is_current_budget", "amount_ghs", "quantity, unit_price_ghs", "hours, overtime_hours",
        "days_late, on_time_flag", "price_variance_pct, price_variance_ghs"], "27,810 rows")
dims = {
 "dim_date": (["PK date_key (yyyymmdd)", "full_date", "day_name, week_of_year", "month_name, year_month", "quarter, year, is_weekend"], "1,827", (-7.2, 5.6)),
 "dim_project": (["PK project_key", "project_id, project_name", "project_type, town, region", "client_name, project_manager", "project_status (SCD2)", "contract_value_ghs", "planned / actual % complete", "valid_from, valid_to, is_current"], "7", (0, 8.2)),
 "dim_client": (["PK client_key", "client_id, client_name", "client_type, region"], "4", (7.2, 5.6)),
 "dim_cost_category": (["PK cost_category_key", "cost_category_code", "cost_category_name", "cost_group"], "5", (-7.6, -0.4)),
 "dim_supplier": (["PK supplier_key", "supplier_id, supplier_name", "supplier_type, town"], "8", (7.6, -0.4)),
 "dim_material": (["PK material_key", "material_id, material_name", "material_category", "standard_unit, standard_price_ghs"], "6", (-5.0, -7.0)),
 "dim_employee": (["PK employee_key", "employee_id, employee_name", "job_title, department (SCD2)", "employment_type", "valid_from, valid_to, is_current"], "76", (5.0, -7.0)),
}
fig, ax = plt.subplots(figsize=(18, 14)); ax.set_xlim(-11, 11); ax.set_ylim(-9.5, 12); ax.axis("off")
def box(x, y, name, cols, rows, w, head):
    h = 0.55 + 0.36 * len(cols)
    for (dx, dy) in [(0, 0)]:
        pass
    ax.add_patch(FancyBboxPatch((x - w/2, y - h/2), w, h, boxstyle="round,pad=0.05", fc=GREY, ec=head, lw=2, zorder=3))
    ax.add_patch(FancyBboxPatch((x - w/2, y + h/2 - 0.55), w, 0.55, boxstyle="round,pad=0.05", fc=head, ec=head, zorder=4))
    ax.text(x, y + h/2 - 0.28, f"{name}  ({rows})", ha="center", va="center", color="white", fontsize=11, weight="bold", zorder=5)
    for i, c in enumerate(cols):
        ax.text(x - w/2 + 0.15, y + h/2 - 0.8 - 0.36 * i, c, ha="left", va="center", fontsize=8.6, zorder=5,
                weight="bold" if c.startswith(("PK", "FK")) else "normal", color=NAVY)
    return h
for name, (cols, rows, (x, y)) in dims.items():
    ax.plot([0, x], [0, y], color=ORANGE, lw=2, zorder=1)
    box(x, y, name, cols, rows, 4.6, NAVY)
box(0, 0, fact[0], fact[1], fact[2], 5.6, ORANGE)
ax.text(0, 11.6, "Rockshell International Ltd. - Star schema (Supabase, schema rockshell)", ha="center", fontsize=16, weight="bold", color=NAVY)
ax.text(0, 11.0, "One central fact table, 7 dimensions joined directly to it (no snowflaking). dim_date also plays the expected / actual delivery-date roles.",
        ha="center", fontsize=10, color=NAVY)
plt.savefig("docs/star_erd.png", dpi=130, bbox_inches="tight"); print("ok")
