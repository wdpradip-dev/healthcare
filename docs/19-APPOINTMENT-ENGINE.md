# 19 — Appointment Engine

## Inputs to availability

Available slots for a `(doctor, department/branch, date range)` are computed by subtracting from the doctor's published template:

1. `DoctorSchedule` rows matching the date's `dayOfWeek`, within `[effectiveFrom, effectiveTo]`.
2. Minus any `ScheduleException` covering that date (full-day `LEAVE`/`HOLIDAY` removes the day entirely; `REDUCED_HOURS`/partial exceptions shrink the working window; `EXTENDED_HOURS` grows it).
3. Minus existing non-terminal `Appointment`s (`SCHEDULED`,`CONFIRMED`,`CHECKED_IN`,`IN_PROGRESS`) at their `startTime`.
4. Minus `bufferMinutes` applied after every slot (a booked 9:00–9:20 slot with a 5-minute buffer blocks 9:00–9:25 from being another slot's start).
5. Capped by `maxAppointments` per day if set, even if time-math would allow more.

Slot generation is a pure function of these inputs — it holds no locks and performs no writes; it's safe to compute repeatedly and cheaply for calendar UIs.

## Booking transaction (conflict prevention)

Booking is the one path that **must** be correct under concurrency: two patients tapping "Confirm" on the same slot within milliseconds of each other must result in exactly one successful booking and one clear rejection, never a double-booked doctor.

**Strategy: database-enforced uniqueness + transactional retry, not application-level locking.**

1. Client sends `POST /appointments` with `doctorId`, `departmentId`, `startTime`.
2. Service opens a database transaction.
3. Re-validates the slot is still within policy (lead time, advance window, doctor active, not superseded by a schedule exception created after the client last fetched availability).
4. Computes `endTime` from the doctor's slot duration.
5. Inserts the `Appointment` row.
6. The **partial unique index** `(doctorId, startTime) WHERE status IN ('SCHEDULED','CONFIRMED','CHECKED_IN','IN_PROGRESS')` (declared in [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)) is the actual source of truth for "is this slot free" — if a concurrent transaction already committed the same `(doctorId, startTime)`, this insert raises a unique-violation at the database level.
7. On unique-violation: the transaction rolls back, the service catches the specific Postgres error code (`23505`), and returns `409 APPOINTMENT_CONFLICT` to the loser of the race. No retry-with-different-slot is attempted automatically — the client re-fetches availability and lets the user choose again, because silently picking an adjacent slot would surprise the patient.
8. On success: commit, then (outside the transaction) enqueue the confirmation notification job.

This means the **application-level "is it available" check in step 3 is an optimization for the common case, not the correctness mechanism** — correctness comes entirely from the database constraint. This is deliberate: relying on a "check-then-insert" pattern in application code without a DB constraint is a classic TOCTOU (time-of-check-to-time-of-use) race that would let two concurrent requests both pass the check before either commits.

```mermaid
sequenceDiagram
    participant P1 as Patient A (request)
    participant P2 as Patient B (request)
    participant API
    participant DB as Postgres

    P1->>API: POST /appointments (9:00 slot)
    P2->>API: POST /appointments (9:00 slot)
    API->>DB: BEGIN; INSERT Appointment (A)
    API->>DB: BEGIN; INSERT Appointment (B)
    DB-->>API: A: INSERT OK, COMMIT
    DB-->>API: B: unique_violation (23505)
    API-->>P1: 201 Created
    API-->>P2: 409 APPOINTMENT_CONFLICT
```

## Reschedule transaction

Reschedule is modeled as "release old slot, reserve new slot" **atomically in one transaction**: update the existing `Appointment` row's `startTime`/`endTime` in place (not delete+recreate, to preserve its id/history) — the same partial unique index protects the new time from conflicting with another appointment, and because it's a single `UPDATE` there's no window where the doctor briefly has zero appointments at either time that another request could race into incorrectly. If the update fails on the unique constraint, the transaction rolls back and the original appointment is untouched (`APPOINTMENT_NOT_AVAILABLE`).

## Cancellation

Cancellation is a simple status update to `CANCELLED` (terminal state), which immediately removes the row from the partial unique index's covered set (since the index only covers non-terminal statuses) — the slot becomes bookable again the instant the cancellation transaction commits, with no separate "release" step needed.

## Check-in / queueing concurrency

Queue numbers are assigned via `SELECT ... FOR UPDATE` on a per-`(branchId, departmentId, date)` counter row (or `SELECT MAX(queueNumber) + 1 ... FOR UPDATE` scoped to that key) inside the check-in transaction, serializing queue-number assignment for the same department/day without blocking check-ins in other departments/branches.

## Policy configuration (per hospital, via `HospitalSettings`)

- `minBookingLeadMinutes` — how soon before a slot a booking may still be made (default 60).
- `maxAdvanceBookingDays` — how far in the future booking is allowed (default 60).
- `cancellationWindowMinutes` / `rescheduleWindowMinutes` — how close to the appointment self-service cancel/reschedule is still allowed (default 120 each); staff can override with a mandatory audited reason.
- `maxReschedulesPerAppointment` — caps reschedule abuse (default 3); the cap counts `rescheduleCount` on the `Appointment` row.
- `autoConfirmBookings` — MVP default `true`: booking directly creates the appointment as `CONFIRMED`, immediately usable with no separate manual confirmation step. A hospital wanting manual confirmation (booking creates `SCHEDULED`, and staff must explicitly promote it to `CONFIRMED`) can disable this flag; the flag itself is schema-supported today, but the manual-confirmation staff UI step is Post-MVP.
- `checkinWindowMinutes` — how early check-in opens (default 30).

## Same-day booking

Same-day booking is simply the case where the requested slot falls within `minBookingLeadMinutes` of "now" — no special-cased logic, just the same policy-window check evaluated with today's date. A hospital can effectively disable same-day booking by setting `minBookingLeadMinutes` larger than the remaining hours in a typical day, without needing a separate feature flag.

## No-show handling

An appointment past its `startTime` + a grace period (default 15 minutes, not currently hospital-configurable — flagged as a Post-MVP settings addition) that never reached `CHECKED_IN` is eligible for staff to mark `NO_SHOW` via `PATCH /appointments/:id/no-show`; it is **not** auto-transitioned by a background job in MVP (a human decision, since "no-show" has operational/billing implications a hospital may want discretion over) — a scheduled job that flags eligible appointments for staff review is the extent of automation in MVP.

## Maximum daily appointments

Enforced both as a derived cap (slots generated from the weekly template naturally bound the day) and, when `DoctorSchedule.maxAppointments` is explicitly set, as an additional check at booking time (`COUNT(*) WHERE doctorId, date, status non-terminal < maxAppointments`) inside the same transaction as the insert, so it's race-safe the same way slot uniqueness is (re-checked inside the transaction, not just at the pre-flight availability read).
