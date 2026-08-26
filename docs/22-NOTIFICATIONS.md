# 22 — Notifications

## Channels

| Channel | MVP status | Provider abstraction |
|---|---|---|
| Push | ✓ shipped | Expo Push Notification service (wraps FCM/APNs) |
| Email | ✓ shipped | Transactional email API (provider-agnostic interface in `packages/shared`) |
| SMS | Post-MVP (interface exists, no provider wired) | Same abstraction pattern, swappable provider |
| In-app | ✓ shipped | `Notification` row + unread badge, no external provider |

All three real channels are accessed through one `NotificationProvider` interface so adding SMS later, or swapping the email vendor, never touches domain code that triggers notifications.

## Event catalog

| Event | Trigger | Channels | Preference-gated? |
|---|---|---|---|
| `OTP_CODE` | Registration/reset OTP requested | SMS/Email (whichever identifier used) | No — transactional |
| `NEW_DEVICE_LOGIN` | Login from unrecognized `DeviceSession` | Email | No — security |
| `PASSWORD_CHANGED` | Password reset/change completes | Email | No — security |
| `APPOINTMENT_BOOKED` | Appointment created | Push, Email | Yes |
| `APPOINTMENT_RESCHEDULED` | Appointment rescheduled | Push, Email | Yes |
| `APPOINTMENT_CANCELLED` | Appointment cancelled | Push, Email | Yes |
| `APPOINTMENT_REMINDER` | Scheduled job, T-24h and T-1h before `startTime` | Push | Yes |
| `CHECKED_IN` | Check-in completes | Push (queue number) | Yes |
| `CONSULTATION_COMPLETE` | Consultation finalized | Push, Email | Yes |
| `PRESCRIPTION_ISSUED` | Prescription created | Push, Email | Yes |
| `REPORT_READY` | Report reaches `RELEASED` | Push, Email | Yes |
| `STAFF_INVITED` | Admin invites staff/doctor | Email | No — transactional (recipient has no preferences yet) |
| `STAFF_DEACTIVATED` | Admin deactivates a staff account | Email | No — account-status |
| `REFRESH_TOKEN_REUSE` | Security event detected | Email | No — security |

## Delivery mechanics

- Every notification-triggering event is enqueued as a job (see [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md)), never sent synchronously in the request path that triggered it — a slow/unavailable push provider must never make `POST /appointments` slow or fail.
- Retry: exponential backoff, base 30s, max 5 attempts, after which `deliveryStatus = FAILED` and the failure surfaces in the Admin "Delivery Health" view ([09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md)) — failures are visible, not silent.
- Idempotency: each job carries a deterministic key (e.g. `appointment:{id}:booked`) so a queue redelivery (at-least-once semantics) does not produce a duplicate push to the user.
- In-app `Notification` rows are always created regardless of push/email delivery outcome — the in-app inbox is the durable record; push/email are best-effort amplifications of it.

## Preferences

`User` notification preferences (channel toggles: push/email; category toggles matching the event catalog above, grouped sensibly — e.g. one "Appointments" toggle covers booked/rescheduled/cancelled/reminder) are stored and editable via `PATCH /notifications/preferences`. Security/transactional events listed above ignore preferences entirely by design — this is documented explicitly so Stage 2 doesn't accidentally make OTP delivery preference-gated.

## Templates

Notification content (subject/body per event, per channel) is stored as editable templates (`GET/PUT /notifications/templates`, `notifications.manage`) with variable interpolation (`{{doctorName}}`, `{{appointmentTime}}`, etc.), so hospitals can adjust tone/branding without a code deploy. MVP ships one shared default template set; per-hospital template overrides are schema-supported (`Settings`-style override keyed by `hospitalId`) but the override UI is Post-MVP — MVP admins edit the platform default, which is a documented scope note for Stage 1's summary.

## Reminders

`APPOINTMENT_REMINDER` is produced by a scheduled job (not triggered by user action) that scans for appointments crossing the T-24h and T-1h thresholds and enqueues one reminder job per threshold per appointment, deduplicated by the idempotency key so a job-scheduler restart never double-sends.
