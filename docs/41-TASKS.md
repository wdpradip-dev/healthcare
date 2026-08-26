# 41 — Tasks

Granular backlog underlying [40-ROADMAP.md](40-ROADMAP.md). ID scheme `T-<phase><sequence>` (e.g. `T-701` = Phase 7, task 1). Priority: `P0` (blocks the phase), `P1` (required for phase completion, order-flexible), `P2` (hardening/polish, can slip to the next phase's start if needed without blocking). Status values: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. This file is updated as work proceeds — see [42-PROJECT-STATE.md](42-PROJECT-STATE.md) for the current-moment rollup.

## Phase 0 — Documentation and architecture

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-001 | P0 | Author all 45 documents in `docs/` per the project's governing instructions | – | docs | DONE |
| T-002 | P0 | Cross-document consistency pass (terminology, RBAC, API/DB alignment) | T-001 | docs | DONE |
| T-003 | P0 | Produce `STAGE 1 COMPLETE` summary and stop for approval | T-002 | docs | DONE |

## Phase 1 — Monorepo + infrastructure

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-101 | P0 | Initialize pnpm workspace + Turborepo config | T-003 | root | DONE |
| T-102 | P0 | Scaffold `apps/api`, `apps/admin`, `apps/mobile` with base configs | T-101 | api, admin, mobile | DONE |
| T-103 | P0 | Scaffold all six `packages/*` with base `package.json`/`tsconfig` | T-101 | packages | DONE |
| T-104 | P1 | `docker-compose.yml`: Postgres + MinIO (object storage emulator) | T-101 | infra | DONE |
| T-105 | P1 | `packages/config`: Zod-validated env loader | T-103 | packages | DONE |
| T-106 | P1 | Root ESLint/Prettier/TypeScript strict config shared across apps | T-102, T-103 | root | DONE |
| T-107 | P1 | Local quality-gate script (`pnpm quality`: lint + type-check, extended in later phases with tests) | T-106 | root | DONE |
| T-109 | P1 | `git init` local repository, `.gitignore` authored | T-101 | root | DONE |
| T-108 | P2 | `README.md` + `CLAUDE.md` authored for repo onboarding | T-102 | root | DONE |

## Phase 2 — Database

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-201 | P0 | Author full Prisma schema per [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md) | T-103 | database | DONE |
| T-202 | P0 | Initial migration incl. partial unique index (raw SQL) for appointment conflict prevention | T-201 | database | DONE |
| T-203 | P0 | Catalog seed script (permissions, roles, role-permissions, medications) | T-202 | database | DONE |
| T-204 | P1 | Demo seed script per [36-SEED-DATA.md](36-SEED-DATA.md), with production guard | T-203 | database | DONE |
| T-205 | P1 | Soft-delete Prisma Client extension (default-excludes `deletedAt` rows on find/count/aggregate reads) | T-201 | database | DONE |
| T-206 | P2 | Local migration smoke-test script (`pnpm db:migration-smoke-test`): spins up a throwaway Docker Postgres container, runs `migrate deploy`, verifies schema + hand-written constraints, tears down. Standalone (not chained into `pnpm quality`, which must stay fast and Docker-independent) — run it whenever `prisma/migrations` changes | T-202, T-107 | root | DONE |
| T-207 | P1 | SUPER_ADMIN bootstrap script (`pnpm --filter @hospital/database db:bootstrap-super-admin`), reads credentials from required env vars, never a hardcoded default (docs/25-SECURITY.md, docs/36-SEED-DATA.md) | T-203 | database | DONE |

## Phase 3 — Authentication / RBAC

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-301 | P0 | NestJS bootstrap: global pipes/filters/interceptors scaffold | T-102, T-201 | api | TODO |
| T-302 | P0 | Auth module: register + OTP issuance/verification | T-301, T-203 | api | TODO |
| T-303 | P0 | Auth module: login, lockout, JWT issuance (RS256) | T-302 | api | TODO |
| T-304 | P0 | Refresh token rotation + reuse-detection | T-303 | api | TODO |
| T-305 | P1 | Forgot/reset password flow + session invalidation | T-303 | api | TODO |
| T-306 | P0 | `packages/validation` Zod schemas for all auth DTOs | T-301 | packages, api | TODO |
| T-307 | P0 | `AuthorizationGuard` + `@RequirePermission` decorator + lint rule enforcing its presence | T-303, T-203 | api | TODO |
| T-308 | P1 | Audit interceptor scaffold (writes `AuditLog` on mutation) | T-301 | api | TODO |
| T-309 | P1 | Auth integration test suite (lockout, OTP exhaustion, refresh reuse) | T-302–T-305 | api | TODO |
| T-310 | P2 | Admin console: Login, Forgot/Reset Password, Activate Account pages | T-303 | admin | TODO |
| T-311 | P2 | Mobile: Splash, Welcome, Login, Register, OTP, Forgot/Reset Password screens | T-302–T-305 | mobile | TODO |

## Phase 4 — Hospital/branch/department/user management

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-401 | P0 | Hospital module (Super Admin CRUD) | T-307 | api | TODO |
| T-402 | P0 | Branch module CRUD | T-401 | api | TODO |
| T-403 | P0 | Department module CRUD | T-402 | api | TODO |
| T-404 | P0 | Users module: invite/activate/deactivate/list | T-307 | api | TODO |
| T-405 | P1 | Admin console shell: sidebar/topbar, permission-driven nav, hospital switcher | T-310 | admin | TODO |
| T-406 | P1 | Admin: Branches, Departments screens | T-402, T-403, T-405 | admin | TODO |
| T-407 | P1 | Admin: Users screen + invite flow UI | T-404, T-405 | admin | TODO |
| T-408 | P2 | Tenant-isolation integration tests for Hospital/Branch/Department/User | T-401–T-404 | api | TODO |

## Phase 5 — Doctor/patient management

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-501 | P0 | Doctor module (profile CRUD, DoctorDepartment assignment) | T-403, T-404 | api | TODO |
| T-502 | P0 | Patient module (registration, profile CRUD, self-service endpoints) | T-307 | api | TODO |
| T-503 | P0 | Staff module CRUD | T-402, T-404 | api | TODO |
| T-504 | P1 | Admin: Doctors, Doctor Details screens | T-501, T-405 | admin | TODO |
| T-505 | P1 | Admin: Staff, Staff Details screens | T-503, T-405 | admin | TODO |
| T-506 | P1 | Admin: Patients, Patient Details (overview tab) screens | T-502, T-405 | admin | TODO |
| T-507 | P2 | Doctor/Patient/Staff permission-matrix integration tests | T-501–T-503 | api | TODO |

## Phase 6 — Schedules

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-601 | P0 | DoctorSchedule module CRUD + overlap validation | T-501 | api | TODO |
| T-602 | P0 | ScheduleException module CRUD | T-601 | api | TODO |
| T-603 | P0 | Availability computation service per [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md) | T-601, T-602 | api | TODO |
| T-604 | P1 | Admin: Doctor Schedules, Schedule Exceptions screens (incl. conflict-resolution flow) | T-603, T-405 | admin | TODO |
| T-605 | P2 | Availability computation unit tests (buffer, exceptions, timezone correctness) | T-603 | api | TODO |

## Phase 7 — Appointments

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-701 | P0 | Appointment module: booking transaction with conflict-safe insert | T-603 | api | TODO |
| T-702 | P0 | Reschedule endpoint (atomic update) | T-701 | api | TODO |
| T-703 | P0 | Cancel + no-show endpoints | T-701 | api | TODO |
| T-704 | P0 | Check-in endpoint + queue numbering (`SELECT ... FOR UPDATE`) | T-701 | api | TODO |
| T-705 | P1 | AppointmentHistory logging on every transition | T-701–T-704 | api | TODO |
| T-706 | P0 | Concurrency integration tests (race conditions per [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md) E2E-APPT-02) | T-701 | api | TODO |
| T-707 | P1 | Admin: Appointments, Appointment Details, Calendar screens | T-701–T-704, T-405 | admin | TODO |
| T-708 | P1 | Mobile: Search Doctors/Departments, Doctor Profile, Doctor Availability | T-501, T-603 | mobile | TODO |
| T-709 | P1 | Mobile: Select Date/Time, Booking Confirmation | T-701 | mobile | TODO |
| T-710 | P1 | Mobile: Upcoming/History, Appointment Details, Reschedule, Cancel, Check-in | T-701–T-704 | mobile | TODO |
| T-711 | P2 | Notification-trigger stubs wired (no-op producer until Phase 10) | T-701–T-704 | api | TODO |

## Phase 8 — Consultations / medical records

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-801 | P0 | Consultation module (start/update/complete state machine) | T-704 | api | TODO |
| T-802 | P0 | ClinicalNote, Diagnosis, Vital modules (incl. internal-note filtering) | T-801 | api | TODO |
| T-803 | P1 | MedicalCondition, Allergy modules | T-502 | api | TODO |
| T-804 | P1 | Admin: Consultation Workspace | T-801–T-803, T-405 | admin | TODO |
| T-805 | P1 | Mobile: Medical Dashboard, Medical History, Consultation Details | T-801–T-803 | mobile | TODO |
| T-806 | P1 | Admin: Patient Details medical-history tab completed | T-802, T-506 | admin | TODO |
| T-807 | P0 | Consultation state-machine + internal-note-exclusion integration tests | T-801, T-802 | api | TODO |

## Phase 9 — Reports / documents

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-901 | P0 | Object storage abstraction (local + S3-compatible implementations) | T-104 | packages, api | TODO |
| T-902 | P0 | Medication, Prescription, PrescriptionItem modules (immutability + supersession) | T-801 | api | TODO |
| T-903 | P0 | LabOrder, LabReport, ImagingReport modules with full pipeline state machine | T-801, T-901 | api | TODO |
| T-904 | P1 | AI-assist provider integration (feature-flagged, graceful absence) | T-903 | api | TODO |
| T-905 | P0 | Document module (upload, MIME sniffing, signed URLs) | T-901 | api | TODO |
| T-906 | P1 | Admin: Reports, Report Details, Documents screens | T-903–T-905, T-405 | admin | TODO |
| T-907 | P1 | Mobile: Prescription List/Details, Lab/Diagnostic Reports, Report Details | T-902, T-903 | mobile | TODO |
| T-908 | P1 | Mobile: Documents, Document Viewer | T-905 | mobile | TODO |
| T-909 | P0 | Report pipeline gating + AI-provenance-pairing integration tests | T-903, T-904 | api | TODO |

## Phase 10 — Notifications

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1001 | P0 | Job queue + worker process bootstrap | T-101 | api, worker | TODO |
| T-1002 | P0 | Notification module + push/email provider abstraction | T-1001 | api, worker | TODO |
| T-1003 | P1 | Wire real notification triggers (replace Phase 7 stubs) | T-1002, T-711 | api | TODO |
| T-1004 | P1 | Template system + reminder scheduled job | T-1002 | api, worker | TODO |
| T-1005 | P1 | Admin: Notifications (delivery health, templates) screen | T-1002, T-405 | admin | TODO |
| T-1006 | P1 | Mobile: Notifications screen, preferences in Settings | T-1002 | mobile | TODO |
| T-1007 | P2 | Delivery retry/idempotency integration tests | T-1002 | api | TODO |

## Phase 11 — Analytics

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1101 | P0 | Aggregate query endpoints (`/analytics/*`) | T-701, T-902, T-903 | api | TODO |
| T-1102 | P1 | Admin: Dashboard, Analytics screens + charts | T-1101, T-405 | admin | TODO |
| T-1103 | P2 | Tenant-isolation + role-visibility tests for analytics | T-1101 | api | TODO |

## Phase 12 — Admin panel (hardening pass)

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1201 | P0 | Roles/Permissions read + assignment endpoints | T-307 | api | TODO |
| T-1202 | P0 | Audit Logs query endpoint | T-308 | api | TODO |
| T-1203 | P0 | HospitalSettings CRUD endpoint | T-401 | api | TODO |
| T-1204 | P1 | Admin: Users/Roles/Permissions screens | T-1201, T-405 | admin | TODO |
| T-1205 | P1 | Admin: Audit Logs screen | T-1202, T-405 | admin | TODO |
| T-1206 | P1 | Admin: Settings screen | T-1203, T-405 | admin | TODO |
| T-1207 | P2 | Consistency pass: every admin screen from Phases 4–11 re-checked against [09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md) loading/empty/error states | all prior admin tasks | admin | TODO |

## Phase 13 — Patient mobile app (hardening pass)

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1301 | P0 | Mobile: Home, Profile, Settings screens | T-701, T-1006 | mobile | TODO |
| T-1302 | P1 | Mobile: Support, About Hospital, Privacy, Terms screens | T-102 | mobile | TODO |
| T-1303 | P0 | Offline/network behavior implementation per [29-OFFLINE-AND-NETWORK-BEHAVIOR.md](29-OFFLINE-AND-NETWORK-BEHAVIOR.md) | T-708–T-710 | mobile | TODO |
| T-1304 | P1 | EAS Build configuration (preview + production profiles) | T-102 | mobile | TODO |
| T-1305 | P2 | Full mobile screen consistency pass against [08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md) | all prior mobile tasks | mobile | TODO |

## Phase 14 — Testing / security

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1401 | P0 | Full E2E suite implementation/execution per [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md) | all domain phases | api, admin, mobile | TODO |
| T-1402 | P0 | Accessibility audit (automated + manual) | T-1207, T-1305 | admin, mobile | TODO |
| T-1403 | P0 | Manual security review pass | T-1401 | api, admin, mobile | TODO |
| T-1404 | P1 | Load/performance smoke test against P95 budgets | T-1401 | api | TODO |
| T-1405 | P2 | Remediate findings from T-1402/T-1403 | T-1402, T-1403 | api, admin, mobile | TODO |

## Phase 15 — Deployment

| ID | Priority | Description | Dependencies | Apps | Status |
|---|---|---|---|---|---|
| T-1501 | P0 | Staging environment provisioned (Vercel project, Render services, Supabase project) | T-1401 | infra | TODO |
| T-1502 | P0 | Manual deployment workflow finalized: quality-gate script, migration step, Render/Vercel CLI deploy commands, smoke-test checklist documented and dry-run | T-107, T-1501 | infra | TODO |
| T-1503 | P0 | Monitoring/alerting wired (Render/Vercel native + Sentry) | T-1501 | infra | TODO |
| T-1504 | P0 | Backup configured (Supabase point-in-time recovery) + restore-drilled | T-1501 | infra | TODO |
| T-1505 | P0 | "Production" environment provisioned (second Vercel/Render/Supabase environment) | T-1502–T-1504 | infra | TODO |
| T-1506 | P0 | [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md) checklist executed | T-1505, T-1403 | all | TODO |
| T-1507 | P0 | Production launch | T-1506 | all | TODO |
| T-1508 | P0 | Replace the malware-scan mock with a real scanner implementation (e.g. ClamAV or a cloud scanning API) behind the existing hook in [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md) — user-confirmed requirement before "production" goes live | T-905 | api | TODO |
