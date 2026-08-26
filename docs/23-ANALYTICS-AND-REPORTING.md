# 23 — Analytics and Reporting

## Principle

Analytics endpoints return **pre-aggregated numbers**, never raw clinical rows — a chart data point is a count/average/rate, not a list of patient names. This keeps `analytics.read` a genuinely lower-sensitivity permission than `patients.read`/`medical_records.read`, and it's why Doctor/Nurse/Receptionist hold no analytics access at all in the default role set (not because the numbers are secret, but because there's no workflow reason for those roles to need them, and unnecessary access is unnecessary risk).

## Metric definitions

See the KPI table already established in [09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md) (Total Patients, Today's Appointments, Completed, Cancelled, No-Shows, Doctor Utilization, Department Statistics, Appointment Trends, Patient Registration Trends) — that table is the canonical definition set; this document covers computation strategy, not re-definition.

## Computation strategy

- **MVP:** metrics are computed on-demand with indexed aggregate queries (`COUNT`, `AVG` with `GROUP BY` over `Appointment`/`Patient`, filtered by `hospitalId` and the requested date range) — acceptable at expected MVP data volumes (single-digit-thousands of appointments/month per hospital) without a separate rollup pipeline.
- **Growth path:** if/when on-demand aggregation shows up in P95 latency budgets, introduce nightly-rollup summary tables (`DailyAppointmentStats`, `DailyRegistrationStats` etc., partitioned by `hospitalId`/date) populated by a scheduled job, with the API reading from rollups for anything older than "today" and computing today live. This is a documented Post-MVP optimization, not built in Stage 2 unless a phase explicitly calls for it in [40-ROADMAP.md](40-ROADMAP.md).

## Tenant isolation in aggregates

Every analytics query is filtered by `hospitalId` at the query builder level (the same repository-layer enforcement described in [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md)), including for chart time-series — there is no "compare your hospital to platform average" feature in MVP specifically because it would require careful anonymized cross-tenant aggregation the team hasn't designed yet; it's a plausible Post-MVP feature, not a current gap being silently worked around.

## Super Admin platform view

`SUPER_ADMIN` analytics are explicitly **aggregate and non-clinical**: hospital count, total appointments platform-wide, platform-wide registration trend — never a per-patient or per-doctor breakdown surfaced at the platform level without switching into a specific hospital's own scoped view first (the hospital-switcher UI element in [06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md)).

## Partial-failure behavior

The Dashboard is composed of independent widgets, each backed by its own query/endpoint (see the `/analytics/*` endpoint list in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)) so one slow/failing metric (e.g. Doctor Utilization requiring a heavier join) degrades gracefully with a per-widget retry affordance rather than failing the whole dashboard load — this is stated once here as the authoritative behavior; [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)'s error-state guidance implements it visually.

## Export

CSV export of the underlying (non-aggregated) list data — e.g. exporting the Appointments table, not the Dashboard charts — is governed by `*.read` implying export capability unless restricted, per [06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md) and the export controls in [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md); exporting clinical-content lists (not just aggregates) is itself an audited action (`DATA_EXPORT`).
