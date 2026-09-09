# 18 — Multi-Tenancy

## Model

Single database, single schema, shared tables, **discriminator-column isolation**: every tenant-scoped table carries a `hospitalId` column, denormalized directly onto the row rather than requiring a join to discover it. This is the standard "pool" multi-tenancy model, chosen over database-per-tenant or schema-per-tenant. Recorded as [ADR-006](43-ARCHITECTURE-DECISIONS.md).

**Why pooled over isolated-schema/database:**
- A hospital directory serving platform-wide discovery (patients searching across hospitals) needs cross-tenant reads by design — schema-per-tenant would make that a fan-out query across N schemas.
- Operational simplicity: one connection pool, one migration run, one backup/restore procedure, dramatically simpler at the team size building this.
- Denormalized `hospitalId` gives per-tenant query performance (it's the leading column in every relevant composite index) without the operational cost of physical isolation.
- Tradeoff accepted: isolation is enforced by application/ORM discipline, not by the database engine physically separating data. This is why the enforcement mechanisms below are non-negotiable, not best-effort.

## Enforcement mechanisms (defense in depth)

1. **Repository-layer scoping.** Every Prisma query that touches a tenant-scoped table goes through a service method that injects `hospitalId` into the `where` clause; there is no code path that queries these tables without it except explicitly-marked Super Admin platform queries (a small, reviewed allowlist of service methods, each requiring `hospitals.read`/`PLATFORM` scope and producing an audit entry).
2. **Authorization guard.** As described in [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md), the `HOSPITAL` scope check independently re-verifies `resource.hospitalId === user.hospitalId` at the guard level, so even a service-layer mistake is caught before the handler runs.
3. **JWT-carried hospitalId.** The access token embeds the user's `hospitalId` at issuance; this value — never a client-supplied header/param — is what scoping and guards use. A malicious or buggy client cannot request "show me hospital B's data" by passing a different id; the id is ignored/overridden server-side wherever it would matter.
4. **Database constraint backstop.** Foreign keys within a tenant-scoped subgraph (e.g. `Appointment.departmentId → Department.id`) are additionally checked at the service layer to confirm the referenced row's own `hospitalId` matches, preventing a cross-tenant object reference from ever being persisted (e.g. booking an appointment with a `doctorId` from Hospital B while `hospitalId` is Hospital A).
5. **Integration tests.** A dedicated tenant-isolation test suite attempts cross-tenant reads/writes for every list/detail/mutate endpoint and asserts `404`/`403` — required, not optional, coverage per [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md).

## Hierarchy

```
Hospital (tenant root)
  └─ Branch
       └─ Department
            └─ Doctor assignment, Appointments held here
  └─ Staff (branch-assigned or hospital-wide)
  └─ Doctor (belongs to exactly one Hospital)
```

A **Doctor belongs to exactly one Hospital** in MVP (no cross-hospital doctor accounts sharing one identity) — if the same physical clinician works at two unrelated hospitals on this platform, they hold two separate `Doctor`/`User` records. This is a deliberate simplification flagged as an open decision in the Stage 1 summary; supporting one clinician identity across hospitals is a non-trivial data-model change (shared `User`, hospital-scoped `Doctor` profiles) deferred until a real customer needs it.

## Patient identity is the one platform-level exception

A `Patient`'s `User` record is **not** hospital-scoped (`User.hospitalId IS NULL` for patients) because a patient legitimately visits multiple hospitals on the platform with one login. What *is* tenant-scoped is every clinical row the patient generates: an `Appointment`, `Consultation`, `Prescription`, `LabReport`, etc. always carries the `hospitalId` of the hospital where that encounter happened. The Patient's mobile "Medical Dashboard" performs an explicitly cross-tenant read of their **own** records only (`patientId = self` across all hospitals) — this is the one legitimate cross-tenant query pattern in the system, and it is scoped by `SELF`, not by any hospital-level permission, so it cannot be generalized into a data leak vector.

`doctors.read` (Phase 5) is the other genuinely platform-scoped permission, held by both `PATIENT` and `SUPER_ADMIN` (docs/02-PERSONAS-AND-ROLES.md's matrix) — a patient browsing the doctor directory to book an appointment is legitimate cross-tenant discovery by design, not a leak, so `GET /doctors`/`GET /doctors/:id` never require a `hospitalId` for these two roles (an explicit one only narrows the search). `RECEPTIONIST` holds `doctors.read` at `BRANCH` scope — narrower than their own hospital — resolved by looking up the caller's own `Staff.branchId` and filtering to doctors with a department assignment in that branch; `NURSE` and `DOCTOR` hold no `doctors.read` permission at all.

`schedules.read` (Phase 6) splits into two genuinely different things behind one permission string, per docs/02's matrix note "PLATFORM, availability only" for `PATIENT`: `GET /schedules/availability` (computed open slots) is open discovery, identical in spirit to `doctors.read`'s platform scope — any role holding `schedules.read` at all may query any doctor's availability, no `hospitalId` needed, since the response carries no PII or tenant-sensitive data (just start/end times). `GET/PUT /schedules/:doctorId` and the `/exceptions` sub-routes (the raw weekly template and leave/holiday rows, which can carry a staff-entered `reason`) are a different, narrower surface: `DOCTOR` is `SELF` only, `RECEPTIONIST`/`NURSE` are `BRANCH` (resolved the same way as `doctors.read`'s branch scope), `ADMIN` is `HOSPITAL`, `SUPER_ADMIN` is `PLATFORM` — and `PATIENT`, despite holding `schedules.read` nominally, is blocked from these two entirely (404, never disambiguated) since their grant is explicitly "availability only." `apps/api/src/schedules/schedule-access.util.ts`'s `loadDoctorInScope()` is the single shared enforcement point for that narrower surface.

`Patient.registeredHospitalId`/`registeredBranchId` (Phase 5) are a narrower, separate concept — which hospital's front desk originally registered them, not where their clinical data lives. This is what a Receptionist's (`BRANCH` scope) or Admin's (`HOSPITAL` scope) `GET /patients` list filters by; a Doctor's `patients.read` (`ASSIGNED` scope) does **not** use it at all — a Doctor can only ever see patients with an actual appointment/consultation relationship to them, which doesn't exist as queryable data until Phase 7's `Appointment` model is wired up, so Phase 5's `GET /patients`/`GET /patients/:id` return nothing for a Doctor caller rather than approximating "assigned" with something broader. A patient who has only ever self-registered via the mobile app has both fields `null` and is invisible to every hospital's staff-facing patient list until some future encounter associates them with one — expected, not a bug: nothing yet has "claimed" them.

## Super Admin cross-tenant access

`SUPER_ADMIN` operates at `PLATFORM` scope, meaning tenant filters are intentionally not applied. Every such query is logged with a mandatory `reasonCode` (break-glass pattern, [25-SECURITY.md](25-SECURITY.md)) and Super Admin actions are visually distinguished in the Audit Logs UI so hospital Admins reviewing their own hospital's audit trail can see when and why platform-level access touched their data.

## What "suspended" means for a Hospital

Setting `Hospital.status = SUSPENDED` (Super Admin action) immediately blocks all login for that hospital's staff/doctor accounts and hides all its doctors/departments/branches from patient-facing discovery, without deleting any data — a reversible operational lever for billing/compliance situations, not a destructive action.
