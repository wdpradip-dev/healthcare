# 40 — Roadmap

Stage 2 implementation proceeds through the phases below in order; each phase follows PLAN → DATABASE → BACKEND → API → ADMIN → MOBILE → TEST → SECURITY REVIEW → DOCUMENTATION → UPDATE PROJECT STATE as mandated by the project's governing instructions. A phase is not started until the prior phase has passed the per-feature Definition of Done in [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md). Full task-level breakdown with IDs: [41-TASKS.md](41-TASKS.md).

## PHASE 0 — Documentation and architecture
This document set. Exit criteria: the Stage 1 Quality Gate in the project's governing instructions, all boxes checked, user approval received (`APPROVE STAGE 1 — START IMPLEMENTATION`).

## PHASE 1 — Monorepo + infrastructure
pnpm workspace + Turborepo scaffold matching [12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md); `docker-compose.yml` (Postgres, MinIO); `packages/config` env validation; `packages/types`, `packages/validation` skeletons; base `tsconfig`, ESLint/Prettier config; local git repository initialized; local quality-gate script skeleton (`pnpm quality`: lint + type-check).

## PHASE 2 — Database
`packages/database` Prisma schema authoring the full model from [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md); initial migration; catalog seed script (permissions, roles, role-permissions, medications) per [36-SEED-DATA.md](36-SEED-DATA.md); demo seed script for dev/staging.

## PHASE 3 — Authentication / RBAC
`apps/api` NestJS bootstrap; Auth module (register/OTP/login/refresh/logout/forgot-reset-password per [16-AUTHENTICATION.md](16-AUTHENTICATION.md)); Authorization guard + permission decorator per [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md); global validation pipe, exception filter, audit interceptor scaffolding.

## PHASE 4 — Hospital/branch/department/user management
Hospitals (Super Admin), Branches, Departments modules; Users module (invite/activate/deactivate); Admin console shell (sidebar/topbar, auth-gated routing) + these modules' screens.

## PHASE 5 — Doctor/patient management
Doctor and Patient modules (profiles, DoctorDepartment assignment); Staff module; Admin screens: Doctors, Doctor Details, Staff, Staff Details, Patients, Patient Details (overview tab only — medical history tab depends on Phase 8).

## PHASE 6 — Schedules
DoctorSchedule + ScheduleException modules; availability computation service per [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md); Admin screens: Doctor Schedules, Schedule Exceptions.

## PHASE 7 — Appointments
Appointment module: booking transaction with the partial-unique-index conflict strategy, reschedule, cancel, checkin, no-show; AppointmentHistory; Admin screens: Appointments, Appointment Details, Calendar; Mobile: Search Doctors/Departments, Doctor Profile, Availability, Select Date/Time, Booking Confirmation, Upcoming/History, Appointment Details, Reschedule, Cancel, Check-in.

## PHASE 8 — Consultations / medical records
Consultation, ClinicalNote, Diagnosis, Vital, MedicalCondition, Allergy modules; Admin: Consultation Workspace; Mobile: Medical Dashboard, Medical History, Consultation Details (read-only). Patient Details medical-history tab (Phase 5 carry-over) completed here.

## PHASE 9 — Reports / documents
Prescription/PrescriptionItem/Medication modules; LabOrder/LabReport/ImagingReport modules with the full pipeline state machine per [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md); Document module + object storage abstraction (local + S3-compatible implementations); AI-assist provider integration per [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) (behind a feature flag, gracefully absent if unconfigured); Admin: Reports, Report Details, Documents; Mobile: Prescription List/Details, Lab/Diagnostic Reports, Report Details, Documents, Document Viewer.

## PHASE 10 — Notifications
Job queue + worker process; Notification module + provider abstraction (push, email; SMS interface only); template system; reminder scheduled job; Admin: Notifications (delivery health, templates); Mobile: Notifications screen, notification preferences in Settings.

## PHASE 11 — Analytics
Aggregate query endpoints per [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md); Admin: Dashboard, Analytics.

## PHASE 12 — Admin panel (hardening pass)
Users/Roles/Permissions screens (read/assign for Admin, full catalog for Super Admin); Audit Logs screen + query endpoint; Settings (HospitalSettings CRUD); cross-cutting admin polish (empty/loading/error states audit across every screen built in Phases 4–11).

## PHASE 13 — Patient mobile app (hardening pass)
Remaining mobile screens not already delivered incrementally in Phases 7–10: Auth stack (Splash, Welcome, Login, Register, OTP, Forgot/Reset Password), Home, Profile, Settings, Support/About/Privacy/Terms; full offline/network behavior per [29-OFFLINE-AND-NETWORK-BEHAVIOR.md](29-OFFLINE-AND-NETWORK-BEHAVIOR.md); EAS Build configuration (preview + production profiles).

## PHASE 14 — Testing / security
Full E2E suite execution per [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md) (many individual cases will already have integration-test coverage from their originating phase — this phase closes any remaining gaps and runs the full suite end-to-end); accessibility audit pass per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md); manual security review pass per [25-SECURITY.md](25-SECURITY.md); load/performance smoke test.

## PHASE 15 — Deployment
Staging environment stood up on Vercel/Render/Supabase per [32-DEPLOYMENT.md](32-DEPLOYMENT.md); the manual deployment workflow (quality-gate script, migration step, CLI deploy commands, smoke-test checklist) finalized and documented in a runnable form; monitoring/alerting wired per [35-MONITORING-AND-OBSERVABILITY.md](35-MONITORING-AND-OBSERVABILITY.md); backup configured (Supabase point-in-time recovery) and restore-drilled per [34-BACKUP-AND-DISASTER-RECOVERY.md](34-BACKUP-AND-DISASTER-RECOVERY.md); "production" environment provisioned; [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md) checklist executed in full; launch.

## Sequencing notes

- Phases 4–6 (structure, people, schedules) must precede Phase 7 (appointments) since appointments reference doctors/departments/schedules.
- Phase 8 (consultations) depends on Phase 7 (an appointment must exist and reach `CHECKED_IN` before a consultation can start).
- Phase 9 (reports/prescriptions) depends on Phase 8 (both are authored within a consultation).
- Phase 10 (notifications) is introduced after Phase 7 rather than earlier, even though notification *triggers* exist from Phase 7 onward — earlier phases queue notification events into a stub/no-op producer until the real queue+worker infrastructure lands in Phase 10, rather than blocking appointment booking on notification infrastructure being ready first.
- Phase 11 (analytics) intentionally follows Phase 9–10 so there is enough real (seeded) transactional data flowing through the system for aggregate queries to be meaningfully testable.
- Phases 12–13 are explicitly "hardening passes" because most of their screens were already built incrementally alongside the domain phases above (e.g. Doctors/Doctor Details in Phase 5, Appointments in Phase 7) — Phase 12/13 close out the remaining shell/settings/auth screens and do a consistency pass, not a from-scratch build.
