# 00 — Project Overview

## What this is

A production-oriented **Hospital Management and Patient Appointment Platform** ("the Platform") supporting multiple hospitals, each with multiple branches and departments. The Platform gives patients a mobile app to find doctors and manage their care, gives clinical staff tools to run consultations and maintain records, and gives hospital administrators a web console to operate the business.

This document is the entry point into `docs/`. It defines vocabulary used consistently across every other document, states the delivery model, and lists the documents that make up the specification.

## Product pillars

1. **Patient mobile app** — discovery, booking, records, reports, notifications.
2. **Doctor/staff workflows** — schedule, consultation, clinical documentation, prescriptions.
3. **Hospital admin web panel** — operations, staffing, scheduling, analytics, configuration.
4. **Backend REST API** — single source of truth for all clients, permission-checked, audited.
5. **PostgreSQL database** — normalized clinical + operational schema via Prisma.
6. **Document/report storage** — object storage abstraction for lab/imaging/consult documents.
7. **Notifications** — push, email, SMS (provider-abstracted) for appointment and record events.
8. **Analytics & reporting** — operational dashboards for hospital administrators.
9. **Audit logging** — immutable trail of access to and changes of sensitive data.
10. **Authentication** — JWT access + rotating refresh tokens, OTP-based mobile verification.
11. **Role-based permissions** — permission-string based authorization, not hardcoded roles.
12. **Multi-hospital/multi-branch architecture** — strict tenant isolation at the hospital level.

## Delivery model

Development proceeds in two stages, enforced by process, not just intent:

- **Stage 1 — Specification.** Everything in `docs/`: product requirements, UX flows, design system, textual mockups, architecture, database design, API contracts, security and privacy models, testing strategy, deployment plan, roadmap, and task backlog. No application code, no Prisma schema/migrations, no generated UI. Ends with a `STAGE 1 COMPLETE` report and an explicit approval gate.
- **Stage 2 — Implementation.** Only begins after the user sends the literal approval phrase `APPROVE STAGE 1 — START IMPLEMENTATION`. Proceeds phase-by-phase per [40-ROADMAP.md](40-ROADMAP.md), each phase following PLAN → DATABASE → BACKEND → API → ADMIN → MOBILE → TEST → SECURITY REVIEW → DOCUMENTATION → UPDATE PROJECT STATE.

## Canonical vocabulary

These terms are used identically in every document. Do not introduce synonyms.

| Term | Meaning |
|---|---|
| **Hospital** | A top-level tenant. Owns branches, staff, patients (via branch registration), and billing/subscription boundary. Cross-hospital data access is never permitted except for `SUPER_ADMIN`. |
| **Branch** | A physical location belonging to one Hospital. Has its own address, operating hours, and department set. |
| **Department** | A clinical specialty grouping within a Branch (e.g. Cardiology), used for doctor discovery and scheduling. |
| **Patient** | An end user of the mobile app who books and receives care. A Patient account is platform-level (one login), but each **clinical relationship** (appointments, records) is scoped to a Hospital once the patient registers/visits there. |
| **Doctor** | A clinician who holds consultations, tied to one or more Branches/Departments within a single Hospital. |
| **Staff** | Non-doctor hospital employees: Nurse, Receptionist, Admin, and other operational roles. |
| **User** | The authentication identity shared by Patient, Doctor, and Staff — see [16-AUTHENTICATION.md](16-AUTHENTICATION.md). A User has one or more Roles. |
| **Role** | A named bundle of Permissions (`PATIENT`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `ADMIN`, `SUPER_ADMIN`). See [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md). |
| **Permission** | A fine-grained `resource.action` string (e.g. `appointments.create`) that authorization checks are actually written against. See [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md). |
| **Consultation** | A single doctor–patient clinical encounter, normally tied to one Appointment. |
| **Medical Record** | The umbrella term for the chronological clinical history of a patient at a Hospital: consultations, clinical notes, diagnoses, allergies, conditions, vitals, prescriptions, lab/imaging reports, documents. |
| **Report** | A lab or imaging result document (structured data + optional attached file). |
| **Document** | Any stored file (report attachment, prescription PDF, ID proof, etc.) referenced via the object storage abstraction. |
| **Tenant** | Synonym for Hospital when discussing isolation/security specifically. |

## Non-negotiable product principles

- **Healthcare-grade, not demo-grade.** Every screen, endpoint, and table must behave like it will hold real patient data.
- **Permission-based authorization**, never role-name string matching in business logic.
- **Tenant isolation is structural**, enforced at the query layer, not just the UI layer.
- **No autonomous AI diagnosis.** Any AI-assisted report analysis is advisory, clearly labeled, and requires human clinician verification before becoming part of the permanent record. See [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md).
- **Auditability by default.** Access to and mutation of clinical data is logged, not opt-in.
- **Material Design 3** governs the patient mobile app; the admin panel uses an MD3-inspired enterprise system with its own density and palette. See [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md).

## Document index

### Product & UX
- [01-PRODUCT-REQUIREMENTS.md](01-PRODUCT-REQUIREMENTS.md)
- [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md)
- [03-USER-FLOWS.md](03-USER-FLOWS.md)
- [04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md)

### Mobile & Admin Design
- [05-MOBILE-APP-SPECIFICATION.md](05-MOBILE-APP-SPECIFICATION.md)
- [06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md)
- [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)
- [08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md)
- [09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md)
- [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md)

### Architecture & Data
- [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md)
- [12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md)
- [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)
- [14-DATABASE-ERD.md](14-DATABASE-ERD.md)
- [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)
- [16-AUTHENTICATION.md](16-AUTHENTICATION.md)
- [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md)
- [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md)

### Clinical Domain
- [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)
- [20-MEDICAL-RECORDS.md](20-MEDICAL-RECORDS.md)
- [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md)
- [22-NOTIFICATIONS.md](22-NOTIFICATIONS.md)
- [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md)
- [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md)

### Trust & Safety
- [25-SECURITY.md](25-SECURITY.md)
- [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)
- [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)

### Engineering Quality
- [28-ERROR-HANDLING.md](28-ERROR-HANDLING.md)
- [29-OFFLINE-AND-NETWORK-BEHAVIOR.md](29-OFFLINE-AND-NETWORK-BEHAVIOR.md)
- [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)
- [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md)
- [32-DEPLOYMENT.md](32-DEPLOYMENT.md)
- [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md)
- [34-BACKUP-AND-DISASTER-RECOVERY.md](34-BACKUP-AND-DISASTER-RECOVERY.md)
- [35-MONITORING-AND-OBSERVABILITY.md](35-MONITORING-AND-OBSERVABILITY.md)

### Delivery
- [36-SEED-DATA.md](36-SEED-DATA.md)
- [37-API-EXAMPLES.md](37-API-EXAMPLES.md)
- [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md)
- [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md)
- [40-ROADMAP.md](40-ROADMAP.md)
- [41-TASKS.md](41-TASKS.md)
- [42-PROJECT-STATE.md](42-PROJECT-STATE.md)
- [43-ARCHITECTURE-DECISIONS.md](43-ARCHITECTURE-DECISIONS.md)

### Additional documents (beyond the requested baseline)
- [44-CODING-STANDARDS.md](44-CODING-STANDARDS.md) — repo-wide conventions (naming, folder layout, commit style, lint/format rules) needed so Stage 2 code is consistent across three apps and six packages without re-deriving conventions per phase.
- [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md) — the MD3 design system expressed as literal token values (hex, dp, sp) in a machine-usable format, so `packages/ui` and Tailwind/theme config in Stage 2 have one authoritative source instead of re-reading prose.

Both are referenced from [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md) and [12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md) respectively; they exist because Stage 2 needs unambiguous, copy-pasteable values, not just narrative guidance.
