# 01 — Product Requirements

## Product vision

A patient can find the right doctor, book an appointment, and hold their entire medical history and reports in one trustworthy app. A doctor can walk into every consultation with full context and leave structured, auditable documentation behind. A hospital can run multiple branches from one admin console with real operational visibility, without compromising patient privacy or clinical safety.

## Target users

- **Patients** booking care across one or more hospitals, wanting fast discovery, transparent scheduling, and access to their own records/reports.
- **Doctors** who need an efficient daily list, full patient context at the point of care, and low-friction documentation.
- **Nurses** who support intake, vitals capture, and care coordination around a consultation.
- **Receptionists** who run the front desk: registration, booking, check-in, queueing.
- **Hospital Admins** who manage staff, schedules, departments, and branch operations and need analytics to run the business.
- **Super Admins** (platform operator) who onboard hospitals and manage the platform itself.

## Problems being solved

1. Patients cannot easily discover doctors/departments or see real-time availability, leading to phone-based, error-prone booking.
2. Paper- or silo-based medical records mean doctors lack history at the point of care, and patients cannot access their own data.
3. Reception desks manage queues and schedules manually, causing double-booking and no-show blindness.
4. Hospital administrators lack a unified, permission-safe view across branches, departments, and doctors.
5. Health data handled without structured audit trails or access control creates compliance and safety risk.

## Core workflows

1. Patient discovers a doctor/department and books an appointment against real availability.
2. Reception/patient check-in converts a booked appointment into a queued visit.
3. Doctor conducts a consultation, enters clinical notes/diagnosis/vitals, issues prescriptions, and orders/reviews reports.
4. Patient views their consolidated medical history, prescriptions, and reports on mobile.
5. Admin manages hospital structure (branches, departments, staff, schedules) and monitors operations via analytics.
6. All of the above emit notifications and audit events.

## MVP scope

**In scope for MVP (Phases 1–13 of the roadmap):**
- Multi-hospital/branch/department structure with tenant isolation.
- Auth (email+password, OTP verification, JWT+refresh) and permission-based RBAC.
- Patient: registration, doctor/department discovery, appointment booking/reschedule/cancel, check-in, medical history, prescriptions, lab/imaging reports, documents, notifications, profile.
- Doctor: schedule view, consultation workflow, clinical notes, diagnosis, prescriptions, report upload/review, follow-up.
- Receptionist: registration, booking, check-in, queue, reschedule/cancel.
- Admin: dashboard, patient/doctor/staff management, departments/branches, schedules, appointments, reports, analytics, users/roles/permissions, audit logs, settings.
- Notifications (push + email at minimum) for appointment lifecycle and record events.
- Audit logging for all clinical data access/mutation and admin actions.
- Structured report pipeline with optional AI-assisted extraction, always human-verified (see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)).

## Post-MVP scope

- SMS notification channel (push/email ship first; SMS provider-abstracted from day one but wired later).
- Telemedicine/video consultation.
- In-app payments/billing and insurance claims.
- Pharmacy inventory and dispensing integration.
- Multi-language localization beyond English.
- Doctor-to-doctor referral workflow across hospitals.
- Patient family/dependent profiles (book on behalf of a child/elderly relative).
- Wearable/health-device data ingestion.

## Non-goals

- The platform does not perform autonomous diagnosis or treatment recommendation. AI assistance is advisory only (see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)).
- The platform is not an EHR replacement for hospitals with existing certified EHR systems and does not target regulatory certifications (e.g., ONC/HL7 FHIR conformance) — resolved as out of scope, since the project is confirmed as a learning/demo build on synthetic data only, not a system intended to hold real patient data (see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md), [ADR-014](43-ARCHITECTURE-DECISIONS.md)).
- No public marketplace/price-comparison across hospitals; discovery is within hospitals onboarded to the platform.
- No native iOS build in MVP (Expo project is iOS-capable, but distribution target for MVP is Android via EAS, per stated tech stack).

## Functional requirements (summary — full detail in [04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md))

- FR-1: Users authenticate via email/password with OTP-verified registration; sessions use short-lived JWT access tokens and rotating refresh tokens.
- FR-2: Every API action is authorized against explicit permission strings, not role names.
- FR-3: Patients can search doctors by name/department/branch and view real availability before booking.
- FR-4: The appointment engine must prevent double-booking under concurrent requests (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)).
- FR-5: Medical records are append-oriented and chronological; edits are versioned, not destructive.
- FR-6: All cross-hospital data access is blocked at the query layer except for `SUPER_ADMIN` platform administration.
- FR-7: Every read/write of clinical data produces an audit log entry with actor, action, target, and timestamp.
- FR-8: Reports/documents are stored via an object storage abstraction with permission-checked, time-limited access URLs.
- FR-9: Notification events are queued and delivered idempotently; failures are retried and surfaced to admins.
- FR-10: Admin analytics respect the viewer's permissions and tenant scope; no cross-hospital metric leakage.

## Non-functional requirements

### Performance
- P95 API response time < 400ms for read endpoints, < 800ms for write endpoints under nominal load (excluding file upload/AI analysis endpoints).
- Doctor availability queries must return in < 300ms P95 for a 30-day window.
- Mobile cold start < 2.5s on a mid-tier Android device.
- Admin dashboard initial paint < 2s on broadband.

### Security
- All traffic over TLS 1.2+. No plaintext secrets in code or logs.
- Passwords hashed with argon2id (or bcrypt cost ≥ 12 as fallback — see [25-SECURITY.md](25-SECURITY.md)).
- Access tokens short-lived (15 min); refresh tokens rotated and revocable per-device.
- All mutating clinical endpoints require permission checks server-side, never trust client-declared role.
- Rate limiting on auth and OTP endpoints to prevent brute force/enumeration.

### Scalability
- Stateless API layer horizontally scalable behind a load balancer; session state lives in Postgres/refresh-token store, not in-process memory.
- Database designed with indexes for tenant-scoped queries (`hospitalId` as leading index column on tenant-scoped tables).
- Object storage abstraction must support swapping local/dev storage for S3-compatible storage without API changes.
- Notification delivery decoupled via a queue-friendly job abstraction so volume growth doesn't block request threads.

## Requirement prioritization

**MUST HAVE**
- Multi-tenant hospital/branch/department model with isolation
- Auth + permission-based RBAC
- Doctor discovery + appointment booking with conflict prevention
- Check-in, consultation, clinical notes, diagnosis, prescriptions
- Medical history, lab/imaging reports, documents (patient-visible)
- Admin: patients, doctors, staff, departments, branches, schedules, appointments
- Audit logging of clinical data access/mutation
- Push + email notifications for appointment lifecycle
- Analytics dashboard (permission-scoped)

**SHOULD HAVE**
- SMS notification channel
- Report AI-assisted extraction pipeline (human-verified)
- Schedule exceptions (leave/holiday) management UI
- Advanced admin analytics (trends, utilization)
- Data export for patients (own records)

**COULD HAVE**
- Multi-language UI
- Family/dependent patient profiles
- Doctor ratings/feedback (non-clinical)
- In-app document e-signature for consent forms

**FUTURE**
- Telemedicine/video visits
- Billing/payments/insurance
- Pharmacy integration
- Wearable data ingestion
- Cross-hospital referrals
