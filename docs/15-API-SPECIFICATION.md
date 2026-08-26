# 15 — API Specification

REST API, versioned base path `/api/v1`, documented live via Swagger/OpenAPI at `/api/v1/docs` (NestJS `@nestjs/swagger`, generated from the same DTOs used for validation). This document is the authoritative contract Stage 2 implements against; concrete request/response bodies are in [37-API-EXAMPLES.md](37-API-EXAMPLES.md).

## Conventions (apply to every endpoint unless stated otherwise)

**Auth:** `Authorization: Bearer <accessToken>` header. Public endpoints are explicitly marked `Public`.

**Response envelope (success):**
```json
{ "data": { }, "meta": { } }
```
`meta` is present only for paginated/list responses.

**Response envelope (error):**
```json
{ "error": { "code": "APPOINTMENT_CONFLICT", "message": "This slot is no longer available.", "details": [] } }
```
Codes are the canonical list in [28-ERROR-HANDLING.md](28-ERROR-HANDLING.md). `details` carries field-level validation errors when `code = VALIDATION_ERROR`.

**Pagination:** offset-based on all list endpoints. Query params `page` (default 1), `pageSize` (default 20, max 100). Response `meta`:
```json
{ "page": 1, "pageSize": 20, "totalItems": 134, "totalPages": 7 }
```

**Filtering:** each list endpoint documents its own filter query params (below). Unknown query params are ignored, not errored, to keep clients forward-compatible.

**Sorting:** `sort` query param, format `field:asc|desc`, defaults documented per endpoint. Only allow-listed fields are sortable (prevents accidental full-table-scan sorts on unindexed columns).

**Validation:** every request body validated against a `packages/validation` Zod schema before reaching a service; failures return `400 VALIDATION_ERROR` with per-field `details`.

**Idempotency:** mutating POSTs that create a resource with real-world side effects users might retry (appointment booking, report AI-analysis trigger) accept an optional `Idempotency-Key` header; a repeated key within 24h returns the original result instead of creating a duplicate.

**Rate limiting:** see [25-SECURITY.md](25-SECURITY.md) for limits per endpoint class; exceeding returns `429` with `RATE_LIMITED`.

**Tenant scoping:** every authenticated request resolves the actor's `hospitalId` (and branch/assignment where relevant) server-side from the access token + DB, never from a client-supplied header/param. Any resource-by-id lookup that resolves to a different tenant than the actor returns `404 NOT_FOUND`, not `403`, to avoid confirming cross-tenant resource existence.

---

## `/auth`

| Method | Path | Auth | Permission | Purpose |
|---|---|---|---|---|
| POST | `/auth/register` | Public | – | Create Patient account, sends OTP |
| POST | `/auth/verify-otp` | Public | – | Verify OTP (registration/reset) |
| POST | `/auth/resend-otp` | Public | – | Resend OTP, rate-limited |
| POST | `/auth/login` | Public | – | Email/phone + password login |
| POST | `/auth/refresh` | Public (refresh token in body) | – | Rotate access/refresh token pair |
| POST | `/auth/logout` | Authenticated | – | Revoke current device session |
| POST | `/auth/forgot-password` | Public | – | Trigger reset OTP |
| POST | `/auth/reset-password` | Public (OTP-verified) | – | Set new password, revoke all sessions |
| GET | `/auth/sessions` | Authenticated | – (self) | List own active `DeviceSession`s |
| DELETE | `/auth/sessions/:id` | Authenticated | – (self) or `users.manage` | Revoke a specific session |
| GET | `/auth/me` | Authenticated | – (self) | Current user + roles + permissions |

Errors: `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `AUTH_ACCOUNT_DISABLED`, `AUTH_SESSION_EXPIRED`, `AUTH_REFRESH_TOKEN_REUSED`, `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, `AUTH_OTP_MAX_ATTEMPTS`, `AUTH_EMAIL_ALREADY_EXISTS`. Full auth flow: [16-AUTHENTICATION.md](16-AUTHENTICATION.md).

## `/users`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/users` | `users.read` | List users (filters: `role`, `status`, `branchId`, `query`) |
| GET | `/users/:id` | `users.read` | User detail |
| POST | `/users/invite` | `users.manage` | Invite staff/doctor (creates `PENDING_ACTIVATION` user + email) |
| PATCH | `/users/:id` | `users.manage` | Update (status, role assignment) |
| POST | `/users/:id/deactivate` | `users.manage` | Deactivate + revoke sessions |
| POST | `/users/activate` | Public (activation token) | Complete invited-user account setup |

## `/staff`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/staff` | `staff.read` | List non-doctor hospital employees (filters: `branchId`, `status`, `query`) |
| GET | `/staff/:id` | `staff.read` | Detail |
| PATCH | `/staff/:id` | `staff.write` | Update job title/branch assignment/status (creation happens via `POST /users/invite` with a Nurse/Receptionist/Admin role, which provisions the linked `Staff` row automatically) |
| POST | `/staff/:id/deactivate` | `staff.write` | Deactivate (mirrors `POST /users/:id/deactivate`, scoped to the Staff record's own detail view) |

## `/patients`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/patients` | `patients.read` | List (filters: `query`, `branchId`, `status`; scope narrows automatically per role) |
| GET | `/patients/:id` | `patients.read` | Detail |
| POST | `/patients` | `patients.write` | Register new patient (Receptionist/Admin) |
| PATCH | `/patients/:id` | `patients.write` | Update demographics/contact |
| GET | `/patients/me` | `patients.read` (self) | Convenience alias for the logged-in patient |
| PATCH | `/patients/me` | `patients.write` (self) | Self-service profile update |

## `/doctors`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/doctors` | `doctors.read` | Discovery list (filters: `query`, `departmentId`, `branchId`, `availableToday`) |
| GET | `/doctors/:id` | `doctors.read` | Profile |
| POST | `/doctors` | `doctors.write` | Create (links to invited User) |
| PATCH | `/doctors/:id` | `doctors.write` | Update profile/status |
| POST | `/doctors/:id/departments` | `doctors.write` | Assign to a Department |
| DELETE | `/doctors/:id/departments/:departmentId` | `doctors.write` | Remove assignment |

## `/departments`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/departments` | `departments.read` | List (filters: `branchId`, `query`) |
| GET | `/departments/:id` | `departments.read` | Detail (includes doctor list) |
| POST | `/departments` | `departments.write` | Create |
| PATCH | `/departments/:id` | `departments.write` | Update/deactivate |

## `/branches`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/branches` | `branches.read` | List |
| GET | `/branches/:id` | `branches.read` | Detail |
| POST | `/branches` | `branches.write` | Create |
| PATCH | `/branches/:id` | `branches.write` | Update/deactivate |

## `/schedules`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/schedules/availability` | `schedules.read` | Computed open slots (`doctorId`, `branchId`/`departmentId`, `from`, `to`) |
| GET | `/schedules/:doctorId` | `schedules.read` | Weekly template |
| PUT | `/schedules/:doctorId` | `schedules.write` | Replace weekly template |
| GET | `/schedules/:doctorId/exceptions` | `schedules.read` | List exceptions |
| POST | `/schedules/:doctorId/exceptions` | `schedules.write` | Create exception |
| DELETE | `/schedules/:doctorId/exceptions/:id` | `schedules.write` | Remove exception |

## `/appointments`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/appointments` | `appointments.read` | List (filters: `status`, `doctorId`, `patientId`, `branchId`, `departmentId`, `from`, `to`, `view=calendar`) |
| GET | `/appointments/:id` | `appointments.read` | Detail (+ `AppointmentHistory`) |
| POST | `/appointments` | `appointments.create` | Book (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md) for conflict handling) |
| PATCH | `/appointments/:id/reschedule` | `appointments.update` | Reschedule (body: `newStartTime`, optional `overrideReason`) |
| PATCH | `/appointments/:id/cancel` | `appointments.cancel` | Cancel (body: optional `reason`) |
| POST | `/appointments/:id/checkin` | `appointments.checkin` | Check in, returns `queueNumber` |
| PATCH | `/appointments/:id/no-show` | `appointments.update` | Mark no-show (staff only, after grace period) |

Errors: `APPOINTMENT_CONFLICT`, `APPOINTMENT_NOT_AVAILABLE`, `APPOINTMENT_CANCELLED`, `VALIDATION_ERROR`, `FORBIDDEN`.

## `/consultations`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/consultations/:id` | `consultations.read` | Detail (notes, diagnoses, vitals — internal notes stripped for non-clinical viewers) |
| POST | `/consultations` | `consultations.write` | Start (body: `appointmentId`) |
| PATCH | `/consultations/:id` | `consultations.write` | Update notes/diagnosis/vitals (autosave) |
| POST | `/consultations/:id/complete` | `consultations.write` | Finalize |

## `/medical-records`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/medical-records/summary` | `medical_records.read` | Dashboard aggregate for a patient (self or assigned) |
| GET | `/medical-records` | `medical_records.read` | Chronological list (filters: `patientId`, `hospitalId`, `type`, `from`, `to`) |
| GET | `/medical-records/conditions` | `medical_records.read` | Patient's `MedicalCondition` list |
| POST | `/medical-records/conditions` | `medical_records.write` | Add condition |
| GET | `/medical-records/allergies` | `medical_records.read` | Patient's `Allergy` list |
| POST | `/medical-records/allergies` | `medical_records.write` | Add allergy |

## `/prescriptions`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/prescriptions` | `prescriptions.read` | List (filters: `patientId`, `status`) |
| GET | `/prescriptions/:id` | `prescriptions.read` | Detail |
| POST | `/prescriptions` | `prescriptions.write` | Issue (body: `consultationId`, items[]) |
| GET | `/prescriptions/:id/pdf` | `prescriptions.read` | Signed URL to generated PDF |

## `/reports` (Lab + Imaging, unified surface)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/reports` | `reports.read` | List (filters: `patientId`, `type=lab\|imaging`, `status`) |
| GET | `/reports/:id` | `reports.read` | Detail |
| POST | `/reports` | `reports.upload` | Create (raw upload against a `LabOrder`) |
| POST | `/reports/:id/analyze` | `reports.upload` | Trigger optional AI extraction (async, see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)) |
| POST | `/reports/:id/verify` | `reports.verify` | Human review → `RELEASED` |
| GET | `/reports/:id/file` | `reports.read` | Time-limited signed download URL |
| POST | `/lab-orders` | `lab_orders.write` | Create order |
| GET | `/lab-orders` | `lab_orders.read` | List orders |

Errors: `REPORT_ACCESS_DENIED`, `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`.

## `/documents`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/documents` | `documents.read` | List (filters: `patientId`, `category`, `linkedEntityType/Id`) |
| POST | `/documents` | `documents.upload` | Upload (multipart) |
| GET | `/documents/:id` | `documents.read` | Metadata |
| GET | `/documents/:id/download` | `documents.read` | Signed download URL |

## `/notifications`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/notifications` | `notifications.read` (self) | List own, filters: `read=true\|false` |
| PATCH | `/notifications/:id/read` | `notifications.read` (self) | Mark read |
| PATCH | `/notifications/read-all` | `notifications.read` (self) | Mark all read |
| PATCH | `/notifications/preferences` | `notifications.read` (self) | Update channel/category preferences |
| GET | `/notifications/health` | `notifications.manage` | Delivery success-rate dashboard data |
| GET | `/notifications/templates` | `notifications.manage` | List templates |
| PUT | `/notifications/templates/:key` | `notifications.manage` | Edit a template |

## `/analytics`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/analytics/overview` | `analytics.read` | Dashboard KPI cards (`range`, `branchId`) |
| GET | `/analytics/appointments/trend` | `analytics.read` | Time series |
| GET | `/analytics/doctors/utilization` | `analytics.read` | Per-doctor utilization |
| GET | `/analytics/departments/load` | `analytics.read` | Per-department volume |
| GET | `/analytics/patients/registration-trend` | `analytics.read` | Time series |

## `/audit-logs`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/audit-logs` | `audit_logs.read` | List (filters: `actorId`, `action`, `resourceType`, `resourceId`, `from`, `to`) — no update/delete route exists |

## `/settings`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/settings` | `settings.manage` | Current hospital's `HospitalSettings` |
| PUT | `/settings` | `settings.manage` | Update booking-policy configuration |

## `/hospitals` (Super Admin only)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/hospitals` | `hospitals.read` | Platform-wide list |
| POST | `/hospitals` | `hospitals.write` | Onboard new hospital |
| PATCH | `/hospitals/:id` | `hospitals.write` | Update/suspend |

## `/roles` and `/permissions`

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/roles` | `roles.read` | List roles (+ permission bundle) |
| POST | `/roles` | `roles.manage` | Create custom role (Super Admin) |
| PATCH | `/roles/:id` | `roles.manage` | Edit custom role's permission bundle |
| GET | `/permissions` | `permissions.read` | Full catalog |

Full request/response payload examples for the highest-traffic endpoints: [37-API-EXAMPLES.md](37-API-EXAMPLES.md).
