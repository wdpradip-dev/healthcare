# 24 — Audit Logging

## Purpose

A tamper-evident, queryable record of who did what to which resource and when, covering both clinical-data access/mutation and administrative/security-sensitive actions — the compliance backbone referenced throughout every clinical feature spec.

## What gets logged

**Always logged (mutations):** every create/update/status-transition on `Appointment`, `Consultation`, `ClinicalNote`, `Diagnosis`, `Vital`, `MedicalCondition`, `Allergy`, `Prescription`, `LabReport`/`ImagingReport`, `Document`, `Hospital`/`Branch`/`Department`, `User`/`Doctor`/`Staff`, `Role`/`RolePermission`, `HospitalSettings`.

**Always logged (sensitive reads):** viewing/downloading a report or document (`REPORT_VIEW`, `REPORT_DOWNLOAD`, `DOCUMENT_VIEW`, `DOCUMENT_DOWNLOAD`), viewing a patient's medical record detail, viewing the audit log itself (coarse-grained), any Super Admin cross-tenant read.

**Always logged (security events):** login, logout, failed login, account lockout, password reset, refresh-token reuse detection, new-device login, force-logout, role assignment changes.

**Not logged:** discovery browsing (doctor/department search, availability lookups) and analytics dashboard widget-level views (logged coarsely as one `ANALYTICS_VIEW` per session, not per widget) — these are non-sensitive, high-frequency reads where per-event logging would flood the table without compliance value.

## Event naming

`RESOURCE_ACTION` in `SCREAMING_SNAKE_CASE`, matching the action vocabulary used throughout this spec (e.g. `APPOINTMENT_CREATE`, `APPOINTMENT_RESCHEDULE`, `APPOINTMENT_CANCEL`, `APPOINTMENT_CHECKIN`, `CONSULTATION_COMPLETE`, `PRESCRIPTION_CREATE`, `REPORT_VERIFY`, `AUTH_LOGIN`, `AUTH_REFRESH_REUSE_DETECTED`). The full canonical list lives alongside each feature in [04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md); this document defines the mechanism, that document enumerates the events per feature.

## Record shape

See `AuditLog` in [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md): `hospitalId`, `actorUserId`, `actorRole` (denormalized at time of action), `action`, `resourceType`, `resourceId`, `beforeState`/`afterState` (JSON snapshots for updates — not stored for high-volume read events, which have no state change to snapshot), `ipAddress`, `userAgent`, `reasonCode` (mandatory for Super Admin break-glass access), `createdAt`.

`beforeState`/`afterState` store only the changed entity's relevant fields (not a full-table dump), and **never** store another entity's full clinical narrative merely because it was referenced — e.g. a `PRESCRIPTION_CREATE` audit row stores the prescription's own fields, not the entire consultation it belongs to.

## Immutability

There is no `PATCH`/`DELETE` route for `/audit-logs` at all — not "permission-denied," genuinely absent from the API surface, so immutability isn't a policy choice that could be misconfigured, it's a structural fact about what exists. The `AuditLog` table has no `updatedAt`/`deletedAt` columns. Database-level: the API's database role has `INSERT`/`SELECT` only on the audit table in production, not `UPDATE`/`DELETE` (enforced via Postgres GRANT, documented in [32-DEPLOYMENT.md](32-DEPLOYMENT.md)) — a second, DB-enforced layer beneath the "no route exists" application-layer guarantee.

## Write durability

Audit writes happen inside the same database transaction as the mutation they're recording wherever the mutation itself is a single transaction (e.g. `APPOINTMENT_CREATE` inserts the `Appointment` row and the `AuditLog` row together — if either fails, both roll back, so there's never a committed mutation with no audit trail). For actions that are inherently outside a single DB transaction (e.g. a file successfully reaching object storage before the `Document` row commits), the audit event is written as part of the same service-layer operation that finalizes the DB write, after storage success is confirmed — the ordering guarantee is "the mutation is never considered complete/committed until its audit row exists," not the reverse.

## Access & query

`GET /audit-logs` (`audit_logs.read`, `HOSPITAL` scope for Admin / `PLATFORM` for Super Admin) supports filtering by actor, action, resource type/id, and date range, with server-side pagination — see [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md). No role below Admin can read audit logs, including Doctors reading their own action history (a Post-MVP "my activity" self-service view is a plausible addition using the same data, scoped to `actorUserId = self`, but is not part of MVP's `audit_logs.read` grant).

## Retention

Audit logs are retained indefinitely by default (no automatic deletion job in MVP) since they are typically the compliance artifact a hospital needs to keep the longest; hospital-configurable retention/archival is a Post-MVP setting — see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md) for how this interacts with a patient's data-deletion request (the audit trail of what happened to their data is retained even after the underlying record is soft-deleted/anonymized, since "there was a deletion event" is itself a fact the hospital needs to retain).
