# 36 — Seed Data

Seed scripts live in `packages/database/seed/` (Stage 2), run via `pnpm --filter database db:seed`. Two seed profiles: **catalog** (always required, minimal, safe for production first-boot) and **demo** (realistic fixture data for local/staging/dev only, never run against production).

## Catalog seed (required in every environment)

- **Permissions:** the full canonical list from [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md), one row per `resource.action` key.
- **Roles:** the six system roles (`PATIENT`,`DOCTOR`,`NURSE`,`RECEPTIONIST`,`ADMIN`,`SUPER_ADMIN`), `isSystem = true`, `hospitalId = null`.
- **RolePermission:** the grant table exactly as specified in [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md)'s matrix, including each grant's scope.
- **Medication catalog:** a starter set of ~50 common medications (name, generic name, common forms/strengths) sufficient for prescription-composer autocomplete to be usable without being clinically exhaustive — a real deployment would import a licensed formulary, flagged as an operational task, not a Stage 2 code task.
- **One `SUPER_ADMIN` bootstrap user:** created via a Stage-2 setup script prompting for email/password (never a hardcoded default credential — see [25-SECURITY.md](25-SECURITY.md)'s stance on no secrets in source), so a fresh production deployment has exactly one way in without a shared default password.

## Demo seed (local/staging/dev only)

- **2 Hospitals**, each with **2 Branches**.
- **4–6 Departments per Branch** (Cardiology, Pediatrics, Orthopedics, Dermatology, General Medicine, ENT).
- **~20 Doctors** distributed across departments/branches, each with a published `DoctorSchedule` (Mon–Sat, varied hours) and one or two `ScheduleException`s (a holiday, a leave day) so availability/exception logic is exercisable without manual setup.
- **~10 Staff** (mix of Nurse/Receptionist/Admin) assigned across branches.
- **~50 Patients** with varied demographics, some with relationships at both seeded hospitals (to exercise the cross-hospital Medical Dashboard view).
- **A spread of Appointments** across past (`COMPLETED`,`CANCELLED`,`NO_SHOW`) and future (`SCHEDULED`,`CONFIRMED`) statuses, including at least one same-day and one imminently-checkin-eligible appointment, so every mobile/admin screen state (empty, populated, mixed-status) is reachable immediately after seeding.
- **A handful of full clinical journeys**: completed consultations with notes/diagnosis/vitals, issued prescriptions (including one superseded/corrected chain), lab/imaging reports at every pipeline stage (`RAW` through `RELEASED`, including one with an AI summary in each of the three verify-decision states: accepted/edited/discarded) — specifically so every state described in [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md) and [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) is visible in seeded data without manually driving the pipeline by hand.
- **Sample `AuditLog` entries** covering both routine and security-relevant events, so the Audit Logs screen isn't empty on first look.
- **Sample `Notification`s** in varied read/unread states.

## Seed data safety rule

The seed script refuses to run its `demo` profile if `NODE_ENV=production` (hard-coded guard, not just a documentation convention) — this prevents the single most damaging seed-data accident (populating a production database with fictitious "test" patients that could be mistaken for real ones, or worse, overwriting real data).

## Fixture naming convention

Demo-seeded patients/doctors use clearly fictitious names drawn from a fixed, recognizable fixture set (the same names appear consistently across docs examples in this specification, e.g. "Alice Kumar," "Dr. Sarah Patel," "Ben Ortiz") so anyone reading logs, screenshots, or test output in a non-production environment can immediately recognize fixture data versus a real record, purely by name pattern recognition, as an extra (non-technical) safety net alongside the environment guard above.
