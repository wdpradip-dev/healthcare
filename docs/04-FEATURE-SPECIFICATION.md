# 04 — Feature Specification

Full specification for every MUST HAVE / SHOULD HAVE feature. Each entry uses the same template. Features are grouped by domain; domain order matches the API domain order in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md).

---

## Domain: Authentication

### Feature: Registration & OTP Verification
- **Purpose:** Create a verified Patient (or staff, via invite — see Staff Invitation) identity.
- **Actors:** Patient (self-service), System.
- **Preconditions:** Email/phone not already registered as an active account.
- **Inputs:** name, email and/or phone, password, accepted terms flag.
- **Business rules:** Password ≥ 8 chars, 1 upper, 1 number (see [25-SECURITY.md](25-SECURITY.md)). OTP is 6 digits, 5 min TTL, max 5 verify attempts, resend cooldown 30s, max 5 resends/hour. Account is `PENDING_ACTIVATION` until OTP confirmed; accounts in this state cannot book appointments.
- **Success state:** `User` + `Patient` created, account `ACTIVE`, tokens issued.
- **Error states:** `VALIDATION_ERROR`, `AUTH_EMAIL_ALREADY_EXISTS`, `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, `AUTH_OTP_MAX_ATTEMPTS`.
- **Permissions:** Public (unauthenticated) endpoint, rate-limited.
- **API:** `POST /auth/register`, `POST /auth/verify-otp`, `POST /auth/resend-otp`.
- **Database:** `User`, `Patient`, `OtpChallenge` (short-lived, not a listed core entity — see [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md) §Supporting Tables).
- **Mobile:** Register, OTP Verification screens ([08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md)).
- **Admin:** N/A (staff use Invitation flow instead).
- **Notifications:** OTP via SMS/email channel (transactional, bypasses user notification preferences).
- **Audit:** `AUTH_REGISTER`, `AUTH_VERIFY_OTP` events logged with masked email/phone.
- **Test requirements:** Duplicate registration, OTP expiry, OTP max-attempts lockout, rate-limit trigger, password policy rejection.

### Feature: Login / Logout / Token Refresh
- **Purpose:** Authenticate a known user and maintain a session across devices.
- **Actors:** Patient, Doctor, Nurse, Receptionist, Admin, Super Admin.
- **Preconditions:** Account `ACTIVE` (not `PENDING_ACTIVATION`, `LOCKED`, or `DISABLED`).
- **Inputs:** identifier (email/phone) + password; refresh token for refresh/logout.
- **Business rules:** 5 failed attempts within 15 min → account `LOCKED` for 15 min, `AUTH_ACCOUNT_LOCKED`. Access token TTL 15 min; refresh token TTL 30 days (patients) / 7 days (staff, tighter due to elevated data access), rotating on every use, one-time-use (reuse of a stale refresh token revokes the whole token family — see [16-AUTHENTICATION.md](16-AUTHENTICATION.md)).
- **Success state:** Access + refresh token pair issued; `DeviceSession` recorded.
- **Error states:** `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `AUTH_ACCOUNT_DISABLED`, `AUTH_SESSION_EXPIRED` (refresh), `AUTH_REFRESH_TOKEN_REUSED`.
- **Permissions:** Public for login; authenticated for refresh/logout.
- **API:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `DELETE /auth/sessions/:id` (revoke a specific device).
- **Database:** `User`, `RefreshToken`, `DeviceSession`.
- **Mobile:** Login screen; Settings → Active Sessions.
- **Admin:** Users → force-logout/revoke sessions `(perm: users.manage)`.
- **Notifications:** New-device login alert (email).
- **Audit:** `AUTH_LOGIN`, `AUTH_LOGOUT`, `AUTH_REFRESH_REUSE_DETECTED` (security-critical, high severity).
- **Test requirements:** Lockout threshold, refresh rotation, stolen-refresh-token reuse detection revokes family, logout invalidates only that device.

### Feature: Forgot / Reset Password
- **Purpose:** Recover account access without support intervention.
- **Actors:** Any authenticated-identity user.
- **Preconditions:** Account exists (response is identical whether or not it exists, to prevent enumeration).
- **Inputs:** identifier → OTP → new password.
- **Business rules:** Successful reset revokes all existing refresh tokens/sessions for that user.
- **Success state:** Password updated, all sessions invalidated, re-login required.
- **Error states:** `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, `VALIDATION_ERROR` (password policy).
- **Permissions:** Public, rate-limited.
- **API:** `POST /auth/forgot-password`, `POST /auth/reset-password`.
- **Database:** `User`, `OtpChallenge`, cascading `RefreshToken` revocation.
- **Mobile:** Forgot Password, Reset Password screens.
- **Admin:** N/A.
- **Notifications:** "Your password was changed" email (security alert, always sent regardless of preferences).
- **Audit:** `AUTH_PASSWORD_RESET` (high severity).
- **Test requirements:** Enumeration resistance, session invalidation after reset.

---

## Domain: Doctor & Department Discovery

### Feature: Search Doctors / Departments
- **Purpose:** Let patients find a doctor or department to book with.
- **Actors:** Patient.
- **Preconditions:** None (public within app after login; hospital data must be `ACTIVE`).
- **Inputs:** query text, department filter, branch filter, "available today" toggle, pagination.
- **Business rules:** Only doctors with `status = ACTIVE` and at least one published schedule are returned by default. Cross-hospital results shown together, hospital name labeled on each card.
- **Success state:** Paginated result list.
- **Error states:** none beyond standard validation; empty state is not an error.
- **Permissions:** `doctors.read` (platform scope for Patient), `departments.read`.
- **API:** `GET /doctors`, `GET /departments`, `GET /doctors/:id`, `GET /departments/:id`.
- **Database:** `Doctor`, `Department`, `Branch`, `Hospital`, `DoctorSchedule` (for "available today").
- **Mobile:** Search Doctors, Search Departments, Doctor List, Doctor Profile, Department Details screens.
- **Admin:** N/A (discovery is patient-facing only).
- **Notifications:** None.
- **Audit:** Not audited (non-sensitive read).
- **Test requirements:** Filter correctness, inactive doctors excluded, cross-hospital labeling.

### Feature: View Doctor Availability
- **Purpose:** Show real, conflict-free open slots before booking.
- **Actors:** Patient, Receptionist.
- **Preconditions:** Doctor has a published schedule for the requested date range.
- **Inputs:** doctorId, branchId, date range (default next 30 days).
- **Business rules:** Slots computed from `DoctorSchedule` minus existing `Appointment`s minus `ScheduleException`s minus buffer time; see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md) for full algorithm.
- **Success state:** Per-day slot list with `AVAILABLE`/`FULL` day markers.
- **Error states:** `NOT_FOUND` (invalid doctor/branch pairing).
- **Permissions:** `schedules.read`.
- **API:** `GET /schedules/availability?doctorId=&branchId=&from=&to=`.
- **Database:** `DoctorSchedule`, `ScheduleException`, `Appointment` (read-only aggregation, no locks held on read).
- **Mobile:** Select Date, Select Time screens.
- **Admin:** Doctor Schedules view (same computation, admin-facing).
- **Notifications:** None.
- **Audit:** Not audited.
- **Test requirements:** Correct exclusion of booked/blocked slots, timezone correctness, buffer-time correctness.

---

## Domain: Appointments

### Feature: Book Appointment
- **Purpose:** Reserve a specific doctor/branch/time slot for a patient.
- **Actors:** Patient (self), Receptionist (on behalf).
- **Preconditions:** Slot within doctor's published availability; patient account verified; slot within hospital's booking-window policy (min lead time, max advance days).
- **Inputs:** doctorId, branchId, departmentId, patientId (self or specified by Receptionist), startTime, reason (optional).
- **Business rules:** Exactly one `Appointment` may hold a given `(doctorId, startTime)` in a non-terminal status (`SCHEDULED`/`CONFIRMED`/`CHECKED_IN`/`IN_PROGRESS`) — enforced by a DB constraint plus transactional check, not application logic alone (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)). Default status on creation: `SCHEDULED` (auto-`CONFIRMED` if hospital policy has no manual-confirmation step — MVP default is auto-confirm).
- **Success state:** `Appointment` created; confirmation notification sent.
- **Error states:** `APPOINTMENT_CONFLICT` (race lost), `APPOINTMENT_NOT_AVAILABLE` (outside published hours/policy window), `VALIDATION_ERROR`, `FORBIDDEN` (booking for another patient without permission).
- **Permissions:** `appointments.create`.
- **API:** `POST /appointments`.
- **Database:** `Appointment`, reads `DoctorSchedule`/`ScheduleException`.
- **Mobile:** Select Date/Time, Booking Confirmation screens.
- **Admin/Receptionist:** Booking flow in admin/reception UI, same API.
- **Notifications:** Booking-confirmed push+email to patient; new-appointment alert to doctor's daily list (in-app).
- **Audit:** `APPOINTMENT_CREATE`.
- **Test requirements:** Concurrent-booking race test (two simultaneous requests for the same slot → exactly one succeeds), policy-window boundary tests.

### Feature: Reschedule Appointment
- **Purpose:** Move an existing appointment to a new slot without losing its identity/history.
- **Actors:** Patient (self, within window), Receptionist/Admin (override with reason).
- **Preconditions:** Current status is `SCHEDULED` or `CONFIRMED`; within reschedule policy window unless overridden.
- **Inputs:** appointmentId, new startTime (+ optional overrideReason for staff).
- **Business rules:** Atomic: release old slot + reserve new slot in one transaction; if new slot unavailable, old slot is untouched. Reschedule count tracked; hospital may cap reschedules per appointment (configurable, default 3).
- **Success state:** Appointment's time updated, `rescheduleCount` incremented, history preserved via `AppointmentHistory`.
- **Error states:** `APPOINTMENT_NOT_AVAILABLE`, `APPOINTMENT_CANCELLED` (if trying to act on a cancelled one), `FORBIDDEN` (outside window, no override permission), `VALIDATION_ERROR` (reschedule cap reached).
- **Permissions:** `appointments.update`.
- **API:** `PATCH /appointments/:id/reschedule`.
- **Database:** `Appointment`, `AppointmentHistory`.
- **Mobile:** Reschedule screen.
- **Admin:** Appointment details → Reschedule action.
- **Notifications:** Reschedule-confirmed to patient; change alert to doctor.
- **Audit:** `APPOINTMENT_RESCHEDULE` (includes override reason if staff-initiated outside window).
- **Test requirements:** Window boundary, cap enforcement, atomicity under concurrent reschedule+cancel.

### Feature: Cancel Appointment
- **Purpose:** Release a slot the patient/hospital no longer needs.
- **Actors:** Patient (self), Receptionist/Admin/Doctor (with reason).
- **Preconditions:** Status not already `COMPLETED`/`CANCELLED`/`CHECKED_IN`→ no, `CHECKED_IN` can still be cancelled by staff (patient self-cancel disabled once checked in).
- **Inputs:** appointmentId, reason (optional for patient, required for staff override).
- **Business rules:** Cancellation policy window mirrors reschedule; late cancellation flagged (`isLateCancellation`) for analytics, not currently penalized financially (no billing in MVP).
- **Success state:** Status → `CANCELLED`, slot released immediately for rebooking.
- **Error states:** `APPOINTMENT_CANCELLED` (already), `FORBIDDEN`.
- **Permissions:** `appointments.cancel`.
- **API:** `PATCH /appointments/:id/cancel`.
- **Database:** `Appointment`, `AppointmentHistory`.
- **Mobile:** Cancel confirmation dialog.
- **Admin:** Appointment details → Cancel action.
- **Notifications:** Cancellation confirmation to patient; alert to doctor's schedule.
- **Audit:** `APPOINTMENT_CANCEL`.
- **Test requirements:** Slot immediately rebookable, late-cancellation flagging.

### Feature: Check-in & Queueing
- **Purpose:** Convert a booked appointment into an active, queued visit.
- **Actors:** Patient (self, app), Receptionist, Nurse.
- **Preconditions:** Status `CONFIRMED`/`SCHEDULED`; within check-in window (default 30 min before start; staff can override).
- **Inputs:** appointmentId.
- **Business rules:** Assigns sequential `queueNumber` scoped to `(branchId, departmentId, date)`. Status → `CHECKED_IN`.
- **Success state:** Queue number returned/displayed.
- **Error states:** `APPOINTMENT_NOT_AVAILABLE` (too early), `APPOINTMENT_CANCELLED`, `FORBIDDEN`.
- **Permissions:** `appointments.checkin`.
- **API:** `POST /appointments/:id/checkin`.
- **Database:** `Appointment` (status, queueNumber, checkedInAt).
- **Mobile:** Check-in button on Appointment Details.
- **Admin/Reception:** Queue board.
- **Notifications:** "You're checked in, queue position N" push.
- **Audit:** `APPOINTMENT_CHECKIN`.
- **Test requirements:** Queue numbering correctness under concurrent check-ins, early check-in rejection.

---

## Domain: Consultation & Medical Records

### Feature: Start / Conduct Consultation
- **Purpose:** Structured clinical encounter tied to a checked-in appointment.
- **Actors:** Doctor.
- **Preconditions:** Appointment status `CHECKED_IN`.
- **Inputs:** vitals, clinical notes, diagnosis (ICD-10 code + description), internal-note flag.
- **Business rules:** Starting a consultation sets appointment → `IN_PROGRESS` and creates a `Consultation` row 1:1 with the appointment. Notes autosave as drafts; only "Complete Consultation" finalizes and makes patient-visible content available.
- **Success state:** `Consultation` record with linked `ClinicalNote`/`Diagnosis`/`Vital` rows; appointment → `COMPLETED` on finalize.
- **Error states:** `VALIDATION_ERROR` (missing required diagnosis/note on complete), `FORBIDDEN` (not the assigned doctor).
- **Permissions:** `consultations.write`, `medical_records.write` (scope `ASSIGNED`).
- **API:** `POST /consultations`, `PATCH /consultations/:id`, `POST /consultations/:id/complete`.
- **Database:** `Consultation`, `ClinicalNote`, `Diagnosis`, `Vital`.
- **Mobile:** N/A for doctor authoring (doctor workflows are documented for completeness; MVP doctor UI ships in the admin/staff web console per [06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md) — see note there). Patient mobile shows read-only Consultation Details.
- **Admin:** Consultation workspace (doctor-facing, hosted in the web console).
- **Notifications:** Consultation-complete summary available → patient notified.
- **Audit:** `CONSULTATION_START`, `CONSULTATION_UPDATE`, `CONSULTATION_COMPLETE`, all medical-record writes individually audited.
- **Test requirements:** State-machine correctness (cannot start without check-in, cannot complete twice), internal-note visibility exclusion from patient API responses.

### Feature: Prescriptions
- **Purpose:** Structured, patient-visible medication orders.
- **Actors:** Doctor (author), Patient (view).
- **Preconditions:** Active or recently completed `Consultation`.
- **Inputs:** medication (from `Medication` catalog or free-text if not catalogued), dosage, frequency, duration, instructions, quantity.
- **Business rules:** A `Prescription` groups one or more `PrescriptionItem`s issued in one consultation. Once issued, immutable (corrections create a new prescription referencing the superseded one, never destructive edit) — supports audit and clinical safety.
- **Success state:** `Prescription` + items created, PDF generated, patient notified.
- **Error states:** `VALIDATION_ERROR` (dosage/duration missing), `FORBIDDEN`.
- **Permissions:** `prescriptions.write` (author, scope `ASSIGNED`), `prescriptions.read` (patient self / doctor assigned / admin hospital).
- **API:** `POST /prescriptions`, `GET /prescriptions/:id`, `GET /prescriptions`.
- **Database:** `Prescription`, `PrescriptionItem`, `Medication`.
- **Mobile:** Prescription List, Prescription Details.
- **Admin:** Consultation workspace prescription composer.
- **Notifications:** "Prescription issued" push+email with PDF link.
- **Audit:** `PRESCRIPTION_CREATE`, `PRESCRIPTION_VIEW` (clinical data view is audited per [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md)).
- **Test requirements:** Immutability enforcement, correction-supersession chain integrity.

---

## Domain: Reports & Documents

### Feature: Lab / Imaging Report Pipeline
- **Purpose:** Move a report from raw upload to a verified, patient-visible record. Full pipeline in [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md) and [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md).
- **Actors:** Doctor (order/verify), Lab/Imaging staff or Doctor (upload), System (optional AI extraction), Patient (view once released).
- **Preconditions:** `LabOrder` exists (or ad-hoc upload linked to a consultation).
- **Inputs:** file (PDF/image), report type, structured values (manual or AI-assisted).
- **Business rules:** Pipeline is strictly RAW → EXTRACTED → (optional) AI_ANALYZED → HUMAN_REVIEWED → RELEASED. A report is never patient-visible before `RELEASED`. AI-generated content is stored in a distinct field/flag (`aiGenerated: true`) and always rendered with a visible "AI-assisted — reviewed by [Doctor]" label; it can never overwrite the clinician's own entered values.
- **Success state:** Report `RELEASED`, patient notified.
- **Error states:** `REPORT_ACCESS_DENIED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `VALIDATION_ERROR`.
- **Permissions:** `lab_orders.write`, `reports.upload`, `reports.verify`, `reports.read`.
- **API:** `POST /reports`, `POST /reports/:id/analyze` (AI-assist, optional), `POST /reports/:id/verify`, `GET /reports/:id`, `GET /reports/:id/file` (signed URL).
- **Database:** `LabOrder`, `LabReport`, `ImagingReport`, `Document`.
- **Mobile:** Lab Reports, Diagnostic Reports, Report Details, Document Viewer.
- **Admin:** Report oversight (metadata + access log).
- **Notifications:** "Report ready" push+email on release.
- **Audit:** `REPORT_UPLOAD`, `REPORT_AI_ANALYZE`, `REPORT_VERIFY`, `REPORT_VIEW`, `REPORT_DOWNLOAD` — every clinical file access logged.
- **Test requirements:** State-machine enforcement (cannot skip to RELEASED without HUMAN_REVIEWED), file-type/size validation, signed-URL expiry, patient cannot see un-released reports.

### Feature: Document Upload & Storage
- **Purpose:** General-purpose file attachment for consultations, reports, and patient pre-visit uploads.
- **Actors:** Patient, Doctor, Nurse, Admin.
- **Preconditions:** Authenticated; target entity (consultation/report/patient) exists and is writable by actor.
- **Inputs:** file (PDF/JPEG/PNG, ≤10MB default), category, linked entity reference.
- **Business rules:** Stored via object storage abstraction (never public buckets); filename sanitized; MIME-type verified server-side (not trusted from client `Content-Type`); virus/malware scan hook (pluggable, stubbed in MVP — see [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md)).
- **Success state:** `Document` row created with storage key; entity linked.
- **Error states:** `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `REPORT_ACCESS_DENIED` (mislinked entity ownership).
- **Permissions:** `documents.upload`, `documents.read`.
- **API:** `POST /documents`, `GET /documents/:id`, `GET /documents/:id/download`.
- **Database:** `Document`.
- **Mobile:** Documents list, Document Viewer.
- **Admin:** Documents module (oversight).
- **Notifications:** None beyond parent-entity notifications.
- **Audit:** `DOCUMENT_UPLOAD`, `DOCUMENT_VIEW`, `DOCUMENT_DOWNLOAD`.
- **Test requirements:** MIME sniffing bypass attempt, oversized file rejection, cross-tenant access denial.

---

## Domain: Notifications

### Feature: Notification Delivery
- **Purpose:** Reliable, multi-channel event delivery.
- **Actors:** System (producer), all authenticated roles (consumer).
- **Preconditions:** An event occurs (appointment lifecycle, report ready, prescription issued, security alert).
- **Inputs:** event type, recipient, payload, channel(s) per user preference.
- **Business rules:** Transactional/security notifications (OTP, password change, new-device login) always send regardless of preference. Delivery is queued and retried (exponential backoff, max 5 attempts) — see [22-NOTIFICATIONS.md](22-NOTIFICATIONS.md).
- **Success state:** Delivered (or queued) and recorded in-app; failures surfaced to Admin delivery-health view.
- **Error states:** Provider failure → retried, then marked `FAILED` after max attempts (non-blocking to the triggering action).
- **Permissions:** `notifications.read` (own), `notifications.manage` (admin, templates/health).
- **API:** `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/preferences`.
- **Database:** `Notification`, notification preference fields on `User`.
- **Mobile:** Notifications screen, Settings → Notification preferences.
- **Admin:** Notifications module (delivery health, template management).
- **Notifications:** N/A (this is the feature itself).
- **Audit:** Security-alert notifications are audit-logged; routine notifications are not.
- **Test requirements:** Retry/backoff behavior, preference-respecting suppression except transactional exceptions, idempotent delivery (no duplicate pushes on retry).

---

## Domain: Admin Operations

### Feature: Hospital Structure Management (Hospital/Branch/Department)
- **Purpose:** Model the physical/organizational structure each hospital operates under.
- **Actors:** Super Admin (hospitals), Admin (branches/departments).
- **Preconditions:** N/A for create; update/delete require no active dependent conflicts (e.g., cannot delete a branch with future appointments).
- **Inputs:** name, address, contact, operating hours, parent references.
- **Business rules:** Deletion is soft (`deletedAt`); a branch/department with future non-terminal appointments cannot be hard-removed from active use — must be deactivated (`status = INACTIVE`) instead, which hides it from discovery but preserves history.
- **Success state:** Entity created/updated; discovery reflects change immediately.
- **Error states:** `VALIDATION_ERROR`, `FORBIDDEN` (cross-tenant), conflict error if deactivating with dependents (soft warning, not hard block, since staff may need to wind down operations — see [04](04-FEATURE-SPECIFICATION.md) Admin UX).
- **Permissions:** `hospitals.write` (Super Admin only), `branches.write`, `departments.write`.
- **API:** `/branches`, `/departments` CRUD (see [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)).
- **Database:** `Hospital`, `Branch`, `Department`.
- **Mobile:** N/A.
- **Admin:** Branches, Departments screens.
- **Notifications:** None.
- **Audit:** `BRANCH_CREATE/UPDATE/DEACTIVATE`, `DEPARTMENT_CREATE/UPDATE/DEACTIVATE`.
- **Test requirements:** Tenant isolation on create/read, dependent-conflict warning accuracy.

### Feature: Staff & Doctor Management
- **Purpose:** Onboard and manage clinical/operational personnel.
- **Actors:** Admin.
- **Preconditions:** Inviter holds `users.manage`/`staff.write`/`doctors.write`.
- **Inputs:** name, email, role(s), branch/department assignment, (doctor) specialty/qualifications/consultation duration.
- **Business rules:** Invitation creates a `User` in `PENDING_ACTIVATION` state + emails a time-limited (72h) activation link; user sets password via OTP-verified flow on first login. Deactivation revokes all sessions immediately.
- **Success state:** Staff/doctor active and assigned.
- **Error states:** `VALIDATION_ERROR`, `AUTH_EMAIL_ALREADY_EXISTS`.
- **Permissions:** `staff.write`, `doctors.write`, `users.manage`.
- **API:** `/users`, `/doctors`, `/staff` (see API spec).
- **Database:** `User`, `Doctor`, `Staff`, `UserRole`.
- **Mobile:** N/A.
- **Admin:** Doctors, Staff, Users screens.
- **Notifications:** Invitation email; deactivation notice.
- **Audit:** `USER_INVITE`, `USER_ACTIVATE`, `USER_DEACTIVATE`, `ROLE_ASSIGN`.
- **Test requirements:** Activation-link expiry, immediate session revocation on deactivation, permission-scope correctness for invited role.

### Feature: Analytics Dashboard
- **Purpose:** Operational visibility for hospital administrators.
- **Actors:** Admin (hospital-scope), Super Admin (platform-scope, aggregate/non-clinical only).
- **Preconditions:** None.
- **Inputs:** date range, branch/department filters.
- **Business rules:** All metrics are pre-aggregated (no raw clinical content in analytics responses); queries always filtered by `hospitalId` at the data-access layer, never only at the presentation layer.
- **Success state:** Dashboard cards/charts render within performance budget ([01-PRODUCT-REQUIREMENTS.md](01-PRODUCT-REQUIREMENTS.md)).
- **Error states:** Partial-data states shown explicitly (not silently zeroed) if a sub-query fails.
- **Permissions:** `analytics.read`.
- **API:** `GET /analytics/*` (see [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md), [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md)).
- **Database:** Aggregation queries over `Appointment`, `Patient`, `Doctor`; materialized/rollup strategy in [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md).
- **Mobile:** N/A.
- **Admin:** Dashboard, Analytics screens.
- **Notifications:** None.
- **Audit:** `ANALYTICS_VIEW` logged at a coarse level (not per-widget) to avoid audit-log flooding.
- **Test requirements:** Tenant isolation of aggregates, role-based metric visibility (Receptionist never sees analytics endpoints — 403).

### Feature: Audit Log Access
- **Purpose:** Give hospitals a compliant, tamper-evident view of who did what.
- **Actors:** Admin (hospital-scope), Super Admin (platform-scope).
- **Preconditions:** None.
- **Inputs:** filters (actor, action, resource type, date range).
- **Business rules:** Audit log rows are immutable (no update/delete API at all, enforced at the DB permission level too — see [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md)).
- **Success state:** Paginated, filtered result set.
- **Error states:** `FORBIDDEN` for non-admin roles.
- **Permissions:** `audit_logs.read`.
- **API:** `GET /audit-logs`.
- **Database:** `AuditLog` (append-only).
- **Mobile:** N/A.
- **Admin:** Audit Logs screen.
- **Notifications:** None (though certain audit events themselves trigger security notifications, e.g. refresh-token-reuse).
- **Audit:** Viewing the audit log is itself audited (`AUDIT_LOG_VIEW`), at coarse granularity.
- **Test requirements:** Immutability (no update/delete route exists), tenant isolation, pagination/filter correctness.
