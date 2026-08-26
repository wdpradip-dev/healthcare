# 03 — User Flows

Notation: `→` step sequence, `[A/B]` branch, `(perm: x)` permission required for that step, `⚠` error/edge case called out explicitly.

## Patient flows

### Patient registration
1. Welcome screen → "Create account" → enter name, email or phone, password → submit.
2. Backend creates `User` (unverified) + `Patient` profile → sends OTP to email/phone.
3. OTP verification screen → enter 6-digit code (5 min TTL, 5 attempts) → `[success → account verified, auto-login]` / `[failure → error, resend after 30s cooldown]`.
4. ⚠ Duplicate email/phone → `VALIDATION_ERROR` with field-level message, no account enumeration beyond "this email is already registered."
5. Post-verification → optional profile completion (DOB, gender, address) → Home.

### Patient login
1. Login screen → email/phone + password → submit.
2. `[success]` → issue access+refresh token → Home.
3. `[MFA not required by default]`; `[unverified account]` → route to OTP verification.
4. ⚠ Invalid credentials → generic `AUTH_INVALID_CREDENTIALS` (never reveal which field was wrong). ⚠ Account locked after 5 failed attempts in 15 min → `AUTH_ACCOUNT_LOCKED`, cooldown shown.

### Forgot password
1. "Forgot password" → enter email/phone → send OTP.
2. Enter OTP → set new password (policy-enforced) → confirm → all existing refresh tokens for that user revoked → redirect to login.

### Find doctor / Find department
1. Home → Search (tab: Doctors | Departments) → text query + filters (department, branch, availability today).
2. Results list with doctor card (photo, name, specialty, branch, next available slot) or department card (name, doctor count, branch).
3. Tap doctor → Doctor profile. Tap department → Department details → doctor list within department.

### View doctor / view availability
1. Doctor profile: bio, specialty, qualifications, branch(es), consultation fee (if configured), ratings (post-MVP).
2. "Book Appointment" → Select branch (if doctor has >1) → Availability calendar (next 30 days, days with slots highlighted) → select date → time slots for that date (`(perm: schedules.read)`), grouped morning/afternoon/evening.
3. ⚠ No slots in window → empty state with "Notify me" (post-MVP) or suggest next available date.

### Book appointment → Confirm
1. Select date → select time slot → reason for visit (optional free text) → review screen (doctor, branch, date/time, fee if any) → Confirm.
2. `(perm: appointments.create)` → backend performs conflict-safe slot reservation (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)) → `[success]` → Booking confirmation screen + push/email notification + calendar-add option.
3. ⚠ Slot taken between selection and confirm → `APPOINTMENT_NOT_AVAILABLE`, return to time-slot screen with refreshed availability.

### Reschedule appointment
1. Appointment details → "Reschedule" (enabled only if within policy window, e.g. >2h before start and status is `SCHEDULED`/`CONFIRMED`) → same date/time picker flow → confirm → old slot released, new slot reserved atomically.
2. ⚠ Outside policy window → action disabled with explanatory text ("Rescheduling closes 2 hours before your appointment").

### Cancel appointment
1. Appointment details → "Cancel" → reason (optional) → confirm dialog → `(perm: appointments.cancel)` → status → `CANCELLED`, slot released, notification sent.
2. ⚠ Already checked-in/completed → cancel unavailable.

### Check-in
1. Patient arrives → in-app "Check in" button becomes active starting N minutes before appointment (configurable, default 30) OR Receptionist checks patient in at the desk.
2. `(perm: appointments.checkin)` → status → `CHECKED_IN`, patient enters branch queue, token/queue number assigned and shown.

### Appointment completion
1. Doctor marks consultation complete from the Consultation workspace → appointment status → `COMPLETED` → triggers follow-up prompt if doctor scheduled one, and unlocks patient-side "View Summary."

### Consultation (patient-visible outcome)
1. Patient's Appointment details, once `COMPLETED`, links to Consultation summary (read-only): diagnosis, notes visible to patient (clinician can mark internal-only notes not shown to patient), prescriptions, ordered reports.

### Medical history
1. Bottom nav → Records → Medical dashboard: timeline of consultations, most recent vitals, active prescriptions, pending reports.
2. Filter by hospital (if patient has visited multiple), date range, type (consultation/prescription/report).

### Prescription
1. Medical dashboard → Prescriptions list (active/past) → Prescription details: medications, dosage, duration, prescribing doctor, linked consultation → "Download PDF."

### Lab report / Diagnostic report
1. Medical dashboard → Reports (tab: Lab | Imaging) → list with status chip (`Pending`, `Available`, `Reviewed`) → Report details: structured values (with reference ranges, out-of-range flagged), attached file viewer, ordering doctor, AI-assisted summary if present (clearly labeled "AI-generated — reviewed by Dr. X" or "Pending clinician review").
2. ⚠ Report not yet verified by clinician → patient sees status `Pending Review`, AI extraction (if any) is hidden or clearly marked provisional per hospital policy (see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)).

### Document upload / Report viewing
1. Patient can upload pre-visit documents (prior reports, insurance card) from Documents screen or during booking → `(perm: documents.upload)` → file picker → type/size validated client + server side → upload progress → appears in Documents list.
2. Document viewer supports PDF/image inline preview with pinch-zoom; download disabled/enabled per hospital data-export policy (MVP: enabled).

### Notifications
1. Notifications tab: grouped (Today/Earlier), types: appointment reminder, booking confirmed, reschedule/cancel, report ready, prescription issued. Tap → deep-links to relevant screen. Mark all read. Notification preferences in Settings (channel toggles: push/email; category toggles).

### Profile management
1. Profile tab → edit name/DOB/gender/contact/address/emergency contact → save `(perm: patients.write, self)`.
2. Change password (requires current password). Manage linked hospitals (view only). Delete account request (soft-delete + data-retention flow, see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)).

## Doctor flows

### Login → Today's appointments
1. Doctor logs in (same auth flow) → Home = Today's schedule: list of appointments in time order with patient name, reason, status chip, queue position.
2. Tap upcoming/checked-in appointment → Patient details.

### Patient details
1. Header (name, age, gender, photo) → tabs: Overview (allergies, conditions, recent vitals flagged prominently), History (chronological consultations), Prescriptions, Reports, Documents. `(perm: patients.read, assigned)` `(perm: medical_records.read, assigned)`.

### Consultation
1. From a `CHECKED_IN` appointment → "Start Consultation" → status → `IN_PROGRESS` → Consultation workspace opens: Vitals (pre-filled if nurse entered), Notes, Diagnosis, Prescription, Order Reports, Attach Documents, Follow-up.

### Medical notes / Diagnosis entry
1. Structured diagnosis entry (ICD-10 code search + free text) + clinical notes (rich text, internal-only toggle) `(perm: consultations.write, medical_records.write)`. Autosave draft every 30s to prevent data loss.

### Prescription
1. Add medication (search from formulary list) → dosage, frequency, duration, instructions → repeat for multiple items → review → "Issue Prescription" `(perm: prescriptions.write)` → generates prescription record + patient-visible PDF + notification.

### Report upload / order
1. "Order Lab/Imaging Report" → select test type(s), priority, notes → creates `LabOrder` `(perm: lab_orders.write)`.
2. Later: "Upload Report" (self or lab staff) → attach file + structured values → triggers optional AI extraction → Doctor reviews → "Verify & Release" `(perm: reports.verify)` → patient-visible.

### Follow-up
1. From consultation, "Schedule Follow-up" → suggest date range (e.g., in 2 weeks) → creates a draft appointment the patient confirms, or books directly if doctor has that permission configured.

### Appointment completion
1. "Complete Consultation" → validates required fields (at least one diagnosis or note) → appointment + consultation status → `COMPLETED` → summary generated → patient notified.

## Receptionist flows

### Patient registration
1. Front desk → "New Patient" → capture demographics + contact + ID proof (optional upload) `(perm: patients.write, branch)` → creates `Patient` (or links existing platform Patient by phone/email match with consent confirmation) → assigns to current Branch/Hospital relationship.

### Appointment booking (on behalf of patient)
1. Search patient (existing) or register new → Select doctor/department → same slot-selection flow as patient app → Confirm `(perm: appointments.create)`.

### Check-in
1. Today's appointments list (branch-wide) → select appointment → "Check In" `(perm: appointments.checkin)` → queue number issued, printed/shown token.

### Queue management
1. Queue board: ordered by check-in time / priority flag → receptionist can reorder for urgent cases (permission-gated, audited), mark no-show after grace period.

### Rescheduling / Cancellation
1. Same policy-window rules as patient flow, but Receptionist can override policy windows with a mandatory reason (audited) `(perm: appointments.update / appointments.cancel, branch)`.

## Admin flows

### Dashboard
1. Login → Dashboard: KPI cards (today's appointments, completed, cancelled, no-shows, total patients), charts (appointment trend, registration trend), department/doctor utilization widgets — all scoped to Admin's Hospital `(perm: analytics.read, hospital)`.

### Patient management
1. Patients list (search/filter/paginate) → Patient details (demographics, appointment history, read-only clinical summary) `(perm: patients.read, hospital)` → edit contact info `(perm: patients.write)`.

### Doctor management
1. Doctors list → Add/Edit doctor (profile, specialties, branches/departments, consultation duration default) `(perm: doctors.write)` → linked to a User account (invite flow: email invite → doctor sets password via OTP-verified link).

### Staff management
1. Staff list (Nurses, Receptionists, other Admins) → invite/edit/deactivate `(perm: staff.write, users.manage)` → assign Role(s) and Branch(es).

### Departments / Branches
1. CRUD screens for Department (name, description, branch association) and Branch (name, address, operating hours, contact) `(perm: departments.write / branches.write)`.

### Schedules
1. Doctor Schedules: weekly recurring template (working days/hours, slot duration, buffer, max daily appointments) per doctor per branch `(perm: schedules.write, hospital)`.
2. Schedule Exceptions: one-off overrides (leave, holiday, extended hours) with date range + reason.

### Appointments / Calendar
1. Hospital-wide appointment list + calendar view (day/week), filterable by branch/department/doctor/status `(perm: appointments.read, hospital)`. Admin can reassign/cancel with reason (audited).

### Reports / Documents
1. Oversight views of reports/documents (metadata + access log), not typically opened content unless explicitly permitted — Admin sees who accessed what, not routinely the clinical content itself, respecting minimum-necessary access (configurable per hospital compliance posture).

### Users / Roles / Permissions
1. Users list → assign roles → Roles screen shows permission bundle (view-only for ADMIN; SUPER_ADMIN can edit the platform catalog).

### Audit logs
1. Searchable/filterable audit trail (actor, action, resource, timestamp, IP) `(perm: audit_logs.read, hospital)`.

### Settings
1. Hospital settings: booking policy (advance window, cancellation window, same-day booking toggle), notification templates, branding (logo/colors for patient-facing hospital info card) `(perm: settings.manage)`.
