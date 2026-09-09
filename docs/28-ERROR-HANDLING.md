# 28 — Error Handling

## Response shape

Every error response uses the envelope defined in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md):
```json
{ "error": { "code": "APPOINTMENT_CONFLICT", "message": "This slot is no longer available.", "details": [] } }
```
`message` is a stable, user-presentable string (not a raw exception message); `details` is populated only for `VALIDATION_ERROR` as an array of `{ field, message }`.

## Canonical error codes

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed schema validation |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login identifier/password mismatch |
| `AUTH_SESSION_EXPIRED` | 401 | Access token expired/invalid and refresh failed |
| `AUTH_ACCOUNT_LOCKED` | 423 | Too many failed login attempts |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account deactivated by Admin |
| `AUTH_ACCOUNT_PENDING_ACTIVATION` | 403 | Login attempted before OTP verification (registration) or activation-link completion (invited staff) — not security-sensitive, routes the client to the verification screen |
| `AUTH_HOSPITAL_SUSPENDED` | 403 | Login blocked because the account's Hospital has `status = SUSPENDED` (docs/18-MULTI-TENANCY.md "What 'suspended' means for a Hospital") |
| `AUTH_ACTIVATION_TOKEN_INVALID` | 400 | Invite activation link/token missing, malformed, expired, wrong purpose, or already used — the invitee must be re-invited |
| `AUTH_REFRESH_TOKEN_REUSED` | 401 | Refresh-token reuse detected, session family revoked |
| `AUTH_OTP_INVALID` | 400 | Wrong OTP code |
| `AUTH_OTP_EXPIRED` | 400 | OTP challenge past TTL |
| `AUTH_OTP_MAX_ATTEMPTS` | 429 | Too many OTP verification attempts |
| `AUTH_EMAIL_ALREADY_EXISTS` | 409 | Registration with a taken email/phone |
| `FORBIDDEN` | 403 | Permission check failed (actor's role never grants this action) |
| `NOT_FOUND` | 404 | Resource doesn't exist, or exists in another tenant (never disambiguated) |
| `APPOINTMENT_CONFLICT` | 409 | Slot already booked (lost a concurrent race) |
| `APPOINTMENT_NOT_AVAILABLE` | 422 | Requested slot outside published availability/policy window |
| `APPOINTMENT_CANCELLED` | 422 | Action attempted on an already-cancelled appointment |
| `SCHEDULE_EXCEPTION_CONFLICT` | 409 | Creating a `ScheduleException` would orphan existing non-terminal appointments in that window — docs/09-ADMIN-DESIGN-MOCKUPS.md's "Notify & Reschedule"/"Notify & Cancel" resolution flow is deferred to Phase 7 (needs `Appointment` reschedule/cancel endpoints that don't exist yet), so the save is rejected outright for now rather than silently orphaning bookings |
| `REPORT_ACCESS_DENIED` | 403 | Report not yet released, or actor lacks scope |
| `FILE_TOO_LARGE` | 413 | Upload exceeds size limit |
| `INVALID_FILE_TYPE` | 415 | Upload fails MIME/signature verification |
| `RATE_LIMITED` | 429 | Rate limit exceeded, see [25-SECURITY.md](25-SECURITY.md) |
| `TENANT_MISMATCH` | 404 | Internal classification for cross-hospital reference attempts (surfaced to client as `NOT_FOUND`, distinct code kept server-side for audit clarity) |
| `INTERNAL_ERROR` | 500 | Unhandled server fault; message is always generic, never leaks stack traces |

New codes are added here first, then to the relevant feature's Error States in [04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md) — this file is the canonical registry.

## Handling layers

- **Validation pipe** (NestJS global pipe): catches schema violations before any handler runs, always `VALIDATION_ERROR`.
- **Domain exceptions**: services throw typed exceptions (e.g. `AppointmentConflictException`) mapped 1:1 to the codes above by a global exception filter — handlers never construct raw HTTP responses themselves, keeping the mapping centralized and consistent.
- **Global exception filter**: catches anything unmapped and returns `INTERNAL_ERROR` with a generic message, while logging the full error (stack trace, request context) server-side only — the client never sees internals.
- **Prisma error translation**: known Postgres error codes (e.g. `23505` unique violation) are translated to the appropriate domain code (`APPOINTMENT_CONFLICT`, `AUTH_EMAIL_ALREADY_EXISTS`) at the repository boundary, not left as raw driver errors bubbling up.

## Client-side handling

- **Mobile & Admin:** a shared HTTP client (in `packages/shared` or per-app thin wrapper) intercepts the error envelope and maps `code` to either an inline field error (`VALIDATION_ERROR` → React Hook Form field errors via the shared Zod schema), a toast/snackbar (transient, recoverable errors), or a full error state (section/page-level failures) — per the states defined in [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md).
- `401 AUTH_SESSION_EXPIRED` triggers a silent refresh attempt once; if that also fails, the client routes to the Auth stack (mobile) / login page (admin) without surfacing a raw error to the user.
- `429 RATE_LIMITED` shows a "Please wait a moment and try again" message, never exposes the raw limit numbers.
- Unmapped/unknown error codes (forward-compatibility: an older client talking to a newer API that introduced a new code) fall back to a generic "Something went wrong" message rather than crashing on an unrecognized code.

## What is never shown to the user

Raw stack traces, SQL error text, internal file paths, third-party provider error payloads, or any `INTERNAL_ERROR` detail beyond the generic message — these are exclusively for server-side structured logging ([35-MONITORING-AND-OBSERVABILITY.md](35-MONITORING-AND-OBSERVABILITY.md)).
