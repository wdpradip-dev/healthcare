# 31 — E2E Test Cases

Concrete step-by-step cases implementing the critical journeys named in [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md). IDs follow `E2E-<domain>-<number>` for traceability from [41-TASKS.md](41-TASKS.md).

## Authentication

- **E2E-AUTH-01 Register → OTP → Home:** Register with new email → receive OTP (test provider stub) → enter correct code → land on Home, verified account, tokens issued.
- **E2E-AUTH-02 Wrong OTP then correct:** Register → enter wrong code (assert `AUTH_OTP_INVALID`, attempt counter increments) → enter correct code → success.
- **E2E-AUTH-03 OTP exhaustion:** Enter wrong code 5 times → assert `AUTH_OTP_MAX_ATTEMPTS`, challenge invalidated, "Request new code" required.
- **E2E-AUTH-04 Login lockout:** 5 failed logins within 15 min → 6th attempt returns `AUTH_ACCOUNT_LOCKED` with unlock countdown; after window, login succeeds with correct password.
- **E2E-AUTH-05 Refresh rotation & reuse detection:** Login → refresh once (token A→B) → replay token A → assert `AUTH_REFRESH_TOKEN_REUSED`, all sessions in the family revoked, security alert notification queued.
- **E2E-AUTH-06 Forgot password → session invalidation:** Reset password → assert all pre-existing refresh tokens for that user now fail.
- **E2E-AUTH-07 Staff activation:** Admin invites a Doctor → activation email (stub) contains valid link → doctor sets password via OTP-verified activation → can log in; expired-link case returns a clear re-invite prompt.

## Doctor discovery & availability

- **E2E-DISC-01 Search filters correctness:** Seed doctors across departments/branches/hospitals → search by department returns only matching, `ACTIVE` doctors; inactive doctors excluded.
- **E2E-DISC-02 Availability respects schedule + exceptions:** Doctor has a Mon–Fri template; a `HOLIDAY` exception on a Wednesday → that Wednesday returns zero slots; adjacent days unaffected.
- **E2E-DISC-03 Availability respects existing bookings:** Book a 9:00 slot → re-fetch availability → 9:00 no longer listed; a slot within the post-buffer window is also excluded when `bufferMinutes > 0`.

## Appointment booking, reschedule, cancel

- **E2E-APPT-01 Happy path booking:** Patient books an open slot → `201`, status `SCHEDULED`/auto-`CONFIRMED` per hospital policy, confirmation notification job enqueued, doctor's daily list shows it.
- **E2E-APPT-02 Concurrent booking race:** Two simultaneous `POST /appointments` for the same `(doctorId, startTime)` → exactly one `201`, one `409 APPOINTMENT_CONFLICT`; exactly one row exists in the database afterward.
- **E2E-APPT-03 Booking outside policy window:** Attempt to book with less than `minBookingLeadMinutes` remaining → `422 APPOINTMENT_NOT_AVAILABLE`.
- **E2E-APPT-04 Reschedule happy path:** Reschedule a `CONFIRMED` appointment to a new open slot → old slot freed (bookable by another patient), new slot held, `rescheduleCount` incremented, `AppointmentHistory` row written.
- **E2E-APPT-05 Reschedule cap:** Reschedule the same appointment `maxReschedulesPerAppointment` times → next attempt rejected with a validation error even though the target slot is open.
- **E2E-APPT-06 Reschedule outside window without override:** Patient attempts reschedule inside the `rescheduleWindowMinutes` window → `422 APPOINTMENT_NOT_AVAILABLE` (a policy-window violation, not a permission failure — consistent with `E2E-APPT-03`/`E2E-CHECKIN-01`'s use of the same code for the same class of rejection; an earlier version of this case said `403`, corrected in Phase 7); Receptionist performs the same action with `overrideReason` → succeeds, `AppointmentHistory` entry includes the reason.
- **E2E-APPT-07 Cancel frees slot immediately:** Cancel a `CONFIRMED` appointment → immediately book the same slot as a different patient → succeeds.
- **E2E-APPT-08 Cancel after check-in blocked for patient:** Patient cannot self-cancel a `CHECKED_IN` appointment; Receptionist can, with a reason.

## Check-in & queueing

- **E2E-CHECKIN-01 Early check-in rejected:** Attempt check-in more than `checkinWindowMinutes` before start → `422 APPOINTMENT_NOT_AVAILABLE`.
- **E2E-CHECKIN-02 Queue numbering under concurrency:** Multiple patients in the same department/day check in concurrently → queue numbers assigned without gaps or duplicates. Phase 7's suite verifies sequential check-in numbering (1, 2, ...) against a real database; genuinely simultaneous first-two-check-ins-of-the-day concurrency is not separately proven — the `SELECT ... FOR UPDATE` implementation locks *existing* rows for that key (docs/19-APPOINTMENT-ENGINE.md), which, like the booking-cap re-check it mirrors, has nothing to lock yet when the set is empty. Unlike booking's exact-slot race (airtight via the database's own partial unique index, independent of any application-level locking), this narrower case relies on the locking strategy alone.

## Consultation & clinical records

- **E2E-CONSULT-01 Full consultation flow:** Check-in → doctor starts consultation → records vitals, notes, diagnosis → issues a prescription → orders a lab report → completes → appointment status `COMPLETED`, patient notified, patient-visible consultation summary excludes any `isInternal` notes.
- **E2E-CONSULT-02 Cannot start without check-in:** Attempt `POST /consultations` against a `SCHEDULED` (not `CHECKED_IN`) appointment → rejected.
- **E2E-CONSULT-03 Cannot complete without required content:** Attempt to complete a consultation with zero notes/diagnosis → `VALIDATION_ERROR`.
- **E2E-CONSULT-04 Prescription immutability:** Attempt to `PATCH` an issued prescription → no such route/rejected; issuing a correction creates a new `Prescription` with `supersedesId` set, original marked `SUPERSEDED`.

## Reports & AI pipeline

- **E2E-REPORT-01 Full pipeline to release:** Order → upload raw file → enter structured values → trigger AI analysis (stub provider) → doctor reviews, accepts AI summary → verify/release → patient can now see it with correct labeling.
- **E2E-REPORT-02 Not visible before release:** At every pre-`RELEASED` stage, patient's `GET /reports/:id` returns `REPORT_ACCESS_DENIED`/`404`.
- **E2E-REPORT-03 AI summary always paired with provenance:** Directly inspect the patient-facing API response for a released AI-assisted report — `aiGenerated: true` and verifying-doctor name are present in the same payload as `aiSummary`, never returned separately.
- **E2E-REPORT-04 Discard AI summary:** Doctor discards the AI summary on verify → released report's patient-facing payload contains no `aiSummary` field.
- **E2E-REPORT-05 Non-doctor cannot verify:** Nurse/Receptionist/Admin attempts `POST /reports/:id/verify` → `403`.

## Tenant isolation

- **E2E-TENANT-01 through -0N (one per resource type):** For `Patient`, `Doctor`, `Appointment`, `Consultation`, `Prescription`, `LabReport`, `Document`, `Department`, `Branch`: an authenticated Hospital-A staff user attempts to read/update a Hospital-B resource by id → `404` in every case; list endpoints never include Hospital-B rows even unfiltered.
- **E2E-TENANT-N+1 Super Admin cross-tenant read is logged:** Super Admin reads a Hospital-B resource with a `reasonCode` → succeeds, `AuditLog` row records the reason and `PLATFORM` scope.

## Admin operations

- **E2E-ADMIN-01 Schedule exception with conflicting appointments:** Creating a full-day `LEAVE` exception over a date with existing appointments surfaces the conflict list and requires an explicit notify-and-reschedule/cancel resolution before saving.
- **E2E-ADMIN-02 Staff deactivation revokes sessions immediately:** Deactivate an active staff user with an open session → their next API call with the old access token fails once it naturally expires, and any refresh attempt fails immediately.
- **E2E-ADMIN-03 Analytics tenant isolation:** Hospital-A Admin's dashboard numbers never change when Hospital-B's data is seeded/modified.

## Accessibility (representative subset; full pass per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md))

- **E2E-A11Y-01:** Booking flow completable via screen reader only (mobile) / keyboard only (admin).
- **E2E-A11Y-02:** All status chips pass an automated contrast check in both light and dark themes.
- **E2E-A11Y-03:** Form validation errors are announced (assert `aria-live`/`accessibilityLiveRegion` firing in test).

## Offline/network

- **E2E-NET-01:** Simulate offline mid-session on mobile → cached appointment list still renders with an offline banner; Book/Cancel actions are disabled, not silently queued.
- **E2E-NET-02:** Simulate a timeout on `POST /appointments` with `Idempotency-Key` set → manual retry with the same key does not create a duplicate appointment even if the original request had actually succeeded server-side.
