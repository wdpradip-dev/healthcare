# 13 — Database Design

PostgreSQL via Prisma. Conventions used throughout this document and enforced in Stage 2:

- **IDs:** UUID v4 (`@default(uuid())`), column `id`.
- **Timestamps:** `createdAt` (`@default(now())`), `updatedAt` (`@updatedAt`) on every table unless noted. Audit/history/join tables that are inherently append-only omit `updatedAt`.
- **Soft delete:** nullable `deletedAt` on every entity that can be removed from active use while preserving history (all "master data" and clinical entities). Hard deletes are never used for clinical data. Rows with `deletedAt IS NOT NULL` are excluded by a default Prisma middleware/repository filter.
- **Tenant column:** `hospitalId` is denormalized directly onto every tenant-scoped table (not derived only via joins) specifically so every query can filter/index on it directly — see [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md) for the rationale.
- **Naming:** Prisma models PascalCase singular; Postgres tables snake_case plural via `@@map`; columns camelCase in Prisma, snake_case in Postgres via `@map`.
- **Enums:** Postgres native enums via Prisma `enum`.

Full relationship diagram: [14-DATABASE-ERD.md](14-DATABASE-ERD.md). Migration approach: [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md).

---

## Identity & Tenancy

### Hospital
**Purpose:** Top-level tenant.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | |
| slug | string | unique, used in URLs/support tooling |
| logoUrl | string? | |
| primaryColor | string? | branding override, falls back to design system default |
| contactEmail | string | |
| contactPhone | string | |
| status | enum(`ACTIVE`,`SUSPENDED`) | |
| createdAt / updatedAt / deletedAt | | |

Unique: `slug`. Indexes: `status`. No FK (root of tenancy). Audit: `HOSPITAL_CREATE/UPDATE/SUSPEND` (Super Admin actions).

### Branch
**Purpose:** Physical location of a Hospital.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | FK → Hospital, required |
| name | string | |
| address | string | |
| city / state / postalCode / country | string | |
| latitude / longitude | float? | for map/distance features (post-MVP use) |
| contactPhone | string | |
| operatingHours | json | `{ day: { open, close } }` |
| status | enum(`ACTIVE`,`INACTIVE`) | |
| createdAt / updatedAt / deletedAt | | |

Unique: none beyond PK. Indexes: `hospitalId`, `(hospitalId, status)`. Audit: `BRANCH_CREATE/UPDATE/DEACTIVATE`.

### Department
**Purpose:** Clinical specialty grouping, scoped to exactly one Branch.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | FK → Hospital (denormalized) |
| branchId | uuid | FK → Branch, required |
| name | string | e.g. "Cardiology" |
| description | text? | |
| status | enum(`ACTIVE`,`INACTIVE`) | |
| createdAt / updatedAt / deletedAt | | |

Indexes: `(hospitalId)`, `(branchId, status)`. Audit: `DEPARTMENT_CREATE/UPDATE/DEACTIVATE`.

### User
**Purpose:** Shared authentication identity for every human actor.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid? | null for `PATIENT`/`SUPER_ADMIN`; required for staff/doctor |
| name | string | full display name (single field — matches the Register screen's one "Full name" input, docs/08-MOBILE-DESIGN-MOCKUPS.md); the identity attribute lives here, not on Patient/Doctor/Staff, since it's common to all three |
| email | string? | unique when present |
| phone | string? | unique when present |
| passwordHash | string | argon2id |
| status | enum(`PENDING_ACTIVATION`,`ACTIVE`,`LOCKED`,`DISABLED`) | |
| failedLoginAttempts | int | default 0, reset on success |
| lockedUntil | timestamp? | |
| lastLoginAt | timestamp? | |
| createdAt / updatedAt / deletedAt | | |

Constraints: at least one of `email`/`phone` non-null (check constraint); unique partial indexes on `email` and `phone` where non-null. Indexes: `hospitalId`. Relationships: 1:1 → `Patient` (optional), 1:1 → `Doctor` (optional), 1:1 → `Staff` (optional), 1:N → `UserRole`, `RefreshToken`, `DeviceSession`, `Notification`. Audit: `USER_CREATE/UPDATE/DEACTIVATE/LOCK/UNLOCK`.

### Role
**Purpose:** Named permission bundle.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid? | null = system-wide role (`PATIENT`,`DOCTOR`,`NURSE`,`RECEPTIONIST`,`ADMIN`,`SUPER_ADMIN`); non-null = hospital-defined custom role (post-MVP feature, schema-ready) |
| key | string | e.g. `DOCTOR`; unique per `hospitalId` (including null) |
| name | string | display name |
| isSystem | boolean | true for the six seeded roles (cannot be edited/deleted) |
| createdAt / updatedAt | | |

Unique: `(hospitalId, key)`. Audit: `ROLE_CREATE/UPDATE/DELETE` (custom roles only; system roles are immutable).

### Permission
**Purpose:** Canonical permission catalog (see [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md) for the full list).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| key | string | e.g. `appointments.create`; unique |
| resource | string | e.g. `appointments` (derived/stored for filtering) |
| action | string | e.g. `create` |
| description | string | |

Seeded via [36-SEED-DATA.md](36-SEED-DATA.md), not user-editable except by `SUPER_ADMIN` adding new permissions as the product grows (append-only in practice).

### UserRole
**Purpose:** Join — a User's assigned Role(s).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User |
| roleId | uuid | FK → Role |
| branchId | uuid? | optional scoping — e.g. a Receptionist assigned to a specific Branch; null = all branches in hospital |
| createdAt | | |

Unique: `(userId, roleId, branchId)`. Audit: `ROLE_ASSIGN/UNASSIGN`.

### RolePermission
**Purpose:** Join — which Permissions (and at what scope) a Role grants.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| roleId | uuid | FK → Role |
| permissionId | uuid | FK → Permission |
| scope | enum(`SELF`,`ASSIGNED`,`BRANCH`,`HOSPITAL`,`PLATFORM`) | see [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md) |

Unique: `(roleId, permissionId)`. Audit: `ROLE_PERMISSION_UPDATE` (custom roles only).

---

## People

### Patient
**Purpose:** Clinical profile for a User with the `PATIENT` role.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User, unique (1:1) |
| dateOfBirth | date? | |
| gender | enum(`MALE`,`FEMALE`,`OTHER`,`UNSPECIFIED`)? | |
| bloodGroup | string? | |
| addressLine1/2, city, state, postalCode, country | string? | |
| emergencyContactName | string? | |
| emergencyContactPhone | string? | |
| createdAt / updatedAt / deletedAt | | |

Relationships: 1:N → `Appointment`, `MedicalCondition`, `Allergy`, `Prescription` (via consultation), `Document`. Audit: `PATIENT_CREATE/UPDATE`.

### Doctor
**Purpose:** Clinical profile for a User with the `DOCTOR` role. Belongs to exactly one Hospital.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User, unique |
| hospitalId | uuid | FK → Hospital |
| qualifications | string | e.g. "MD, DM Cardiology" |
| bio | text? | |
| yearsOfExperience | int? | |
| consultationFee | decimal? | |
| defaultConsultationDurationMinutes | int | default 20 |
| photoUrl | string? | |
| status | enum(`ACTIVE`,`INACTIVE`,`ON_LEAVE`) | |
| createdAt / updatedAt / deletedAt | | |

Indexes: `hospitalId`, `status`. Relationships: N:M → `Department` via `DoctorDepartment`; 1:N → `DoctorSchedule`, `ScheduleException`, `Appointment`, `Consultation`. Audit: `DOCTOR_CREATE/UPDATE/DEACTIVATE`.

### DoctorDepartment
**Purpose:** Which Department(s)/Branch(es) a Doctor practices in (a Department implies exactly one Branch, so this single join covers both).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| doctorId | uuid | FK → Doctor |
| departmentId | uuid | FK → Department |
| isPrimary | boolean | default false; drives default branch pre-selection in booking UI |

Unique: `(doctorId, departmentId)`.

### Staff
**Purpose:** Non-doctor hospital employee profile (Nurse, Receptionist, Admin).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User, unique |
| hospitalId | uuid | FK → Hospital |
| branchId | uuid? | primary branch assignment; null = hospital-wide (typical for Admin) |
| jobTitle | string? | free text display title |
| status | enum(`ACTIVE`,`INACTIVE`) | |
| createdAt / updatedAt / deletedAt | | |

Indexes: `hospitalId`, `branchId`. Audit: `STAFF_CREATE/UPDATE/DEACTIVATE`.

---

## Scheduling

### DoctorSchedule
**Purpose:** Recurring weekly availability template.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | denormalized |
| doctorId | uuid | FK → Doctor |
| departmentId | uuid | FK → Department (implies branch) |
| dayOfWeek | int | 0 (Sun) – 6 (Sat) |
| startTime | time | |
| endTime | time | |
| slotDurationMinutes | int | e.g. 20 |
| bufferMinutes | int | default 0; gap inserted after each slot |
| maxAppointments | int? | optional hard cap independent of slot math |
| effectiveFrom | date | |
| effectiveTo | date? | null = ongoing |
| createdAt / updatedAt | | |

Indexes: `(doctorId, dayOfWeek)`, `hospitalId`. Business rule: `startTime < endTime`; overlapping rows for the same `(doctorId, dayOfWeek)` within the same effective range are rejected at the service layer (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)). Audit: `SCHEDULE_CREATE/UPDATE`.

### ScheduleException
**Purpose:** One-off override (leave, holiday, extended/reduced hours).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | |
| doctorId | uuid? | null = branch/hospital-wide holiday |
| branchId | uuid? | required when `doctorId` is null |
| type | enum(`LEAVE`,`HOLIDAY`,`EXTENDED_HOURS`,`REDUCED_HOURS`) | |
| startDate / endDate | date | inclusive range |
| startTime / endTime | time? | null = full day |
| reason | string? | |
| createdBy | uuid | FK → User |
| createdAt | | |

Indexes: `(doctorId, startDate, endDate)`, `(branchId, startDate, endDate)`. Audit: `SCHEDULE_EXCEPTION_CREATE/UPDATE/DELETE`.

---

## Appointments

### Appointment
**Purpose:** A reserved doctor/patient time slot — the core transactional entity. Full lifecycle in [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | denormalized |
| branchId | uuid | denormalized |
| departmentId | uuid | FK → Department |
| doctorId | uuid | FK → Doctor |
| patientId | uuid | FK → Patient |
| startTime | timestamptz | |
| endTime | timestamptz | derived from schedule slot duration at creation time |
| status | enum(`SCHEDULED`,`CONFIRMED`,`CHECKED_IN`,`IN_PROGRESS`,`COMPLETED`,`CANCELLED`,`NO_SHOW`) | |
| reason | string? | patient-entered visit reason |
| queueNumber | int? | assigned at check-in |
| checkedInAt / startedAt / completedAt / cancelledAt | timestamptz? | |
| cancelReason | string? | |
| rescheduleCount | int | default 0 |
| isLateCancellation | boolean | default false |
| createdBy | uuid | FK → User (may be the patient themself or staff) |
| createdAt / updatedAt / deletedAt | | |

**Unique constraint (conflict prevention):** partial unique index on `(doctorId, startTime)` **where** `status IN ('SCHEDULED','CONFIRMED','CHECKED_IN','IN_PROGRESS')` — the database itself refuses a second non-terminal appointment at the same doctor/time, backstopping the transactional check in application code. Indexes: `(hospitalId, branchId, startTime)`, `(doctorId, startTime)`, `(patientId, startTime)`, `(status)`. Audit: every status transition audited individually (`APPOINTMENT_CREATE/RESCHEDULE/CANCEL/CHECKIN/COMPLETE/NO_SHOW`).

### AppointmentHistory
**Purpose:** Immutable trail of every state change to an Appointment (distinct from the general `AuditLog`, kept domain-local for fast "appointment timeline" UI reads without querying the audit table).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| appointmentId | uuid | FK → Appointment |
| action | enum(`CREATED`,`RESCHEDULED`,`CANCELLED`,`CHECKED_IN`,`COMPLETED`,`NO_SHOW`) | |
| previousStartTime / newStartTime | timestamptz? | populated for `RESCHEDULED` |
| reason | string? | |
| performedBy | uuid | FK → User |
| performedAt | timestamptz | `@default(now())` |

No `updatedAt`/`deletedAt` — append-only. Indexes: `appointmentId`.

---

## Clinical Records

### Consultation
**Purpose:** One clinical encounter, 1:1 with an Appointment.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| appointmentId | uuid | FK → Appointment, unique |
| hospitalId | uuid | denormalized |
| doctorId | uuid | denormalized |
| patientId | uuid | denormalized |
| status | enum(`IN_PROGRESS`,`COMPLETED`) | |
| startedAt / completedAt | timestamptz? | |
| createdAt / updatedAt | | |

Audit: `CONSULTATION_START/UPDATE/COMPLETE`.

### ClinicalNote
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| consultationId | uuid | FK → Consultation |
| authorId | uuid | FK → User (Doctor/Nurse) |
| content | text | |
| isInternal | boolean | default false; internal notes excluded from all patient-facing API responses |
| createdAt / updatedAt | | |

Audit: `CLINICAL_NOTE_CREATE/UPDATE`.

### Diagnosis
**Purpose:** Per-consultation diagnosis entry.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| consultationId | uuid | FK → Consultation |
| icd10Code | string? | |
| description | string | |
| createdAt | | |

Audit: `DIAGNOSIS_CREATE`.

### MedicalCondition
**Purpose:** Longitudinal patient problem list (distinct from per-visit `Diagnosis`).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| patientId | uuid | FK → Patient |
| hospitalId | uuid | denormalized |
| name | string | |
| status | enum(`ACTIVE`,`RESOLVED`,`CHRONIC`) | |
| diagnosedDate | date? | |
| notes | text? | |
| recordedBy | uuid | FK → User |
| createdAt / updatedAt | | |

Audit: `MEDICAL_CONDITION_CREATE/UPDATE`.

### Allergy
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| patientId | uuid | FK → Patient |
| hospitalId | uuid | denormalized |
| allergen | string | |
| reaction | string? | |
| severity | enum(`MILD`,`MODERATE`,`SEVERE`) | |
| recordedBy | uuid | FK → User |
| recordedAt | | |

High-visibility field surfaced prominently in Patient Details/Consultation UI. Audit: `ALLERGY_CREATE/UPDATE`.

### Vital
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| consultationId | uuid | FK → Consultation |
| patientId | uuid | denormalized |
| bloodPressureSystolic / bloodPressureDiastolic | int? | |
| heartRate | int? | bpm |
| temperatureCelsius | decimal? | |
| weightKg / heightCm | decimal? | |
| spo2 | int? | percentage |
| recordedBy | uuid | FK → User (often Nurse) |
| recordedAt | | |

Audit: `VITAL_RECORD`.

### Prescription
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| consultationId | uuid | FK → Consultation |
| hospitalId | uuid | denormalized |
| doctorId | uuid | denormalized |
| patientId | uuid | denormalized |
| status | enum(`ACTIVE`,`SUPERSEDED`,`EXPIRED`) | |
| supersedesId | uuid? | self-FK, correction chain |
| issuedAt | timestamptz | |
| createdAt | | |

Immutable after creation (corrections insert a new row referencing `supersedesId`; no update endpoint exists for clinical content). Audit: `PRESCRIPTION_CREATE/VIEW`.

### Medication
**Purpose:** Formulary catalog for prescription authoring autocomplete.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | string | |
| genericName | string? | |
| form | string? | tablet/syrup/injection etc. |
| strength | string? | |
| isActive | boolean | default true |

Global (not hospital-scoped) — shared formulary reference data, seeded and periodically updated by platform ops.

### PrescriptionItem
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| prescriptionId | uuid | FK → Prescription |
| medicationId | uuid? | FK → Medication, nullable if not catalogued |
| freeTextName | string? | required when `medicationId` is null |
| dosage | string | |
| frequency | string | e.g. "Twice daily" |
| durationDays | int? | |
| instructions | string? | e.g. "After food" |
| quantity | string? | |

### LabOrder
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| consultationId | uuid? | FK → Consultation (nullable — Admin/Reception can also place ad-hoc orders in some hospital workflows, post-MVP toggle; MVP always ties to a consultation) |
| hospitalId | uuid | denormalized |
| doctorId | uuid | denormalized |
| patientId | uuid | denormalized |
| testType | string | |
| priority | enum(`ROUTINE`,`URGENT`) | |
| status | enum(`ORDERED`,`IN_PROGRESS`,`COMPLETED`,`CANCELLED`) | |
| notes | string? | |
| orderedAt | | |

Audit: `LAB_ORDER_CREATE/UPDATE`.

### LabReport
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| labOrderId | uuid | FK → LabOrder |
| hospitalId | uuid | denormalized |
| patientId | uuid | denormalized |
| reportType | string | |
| structuredValues | jsonb | `[{ name, value, unit, referenceRange, flag }]` |
| pipelineStatus | enum(`RAW`,`EXTRACTED`,`AI_ANALYZED`,`HUMAN_REVIEWED`,`RELEASED`) | see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) |
| aiGenerated | boolean | default false |
| aiSummary | text? | |
| verifiedBy | uuid? | FK → User (Doctor) |
| verifiedAt | timestamptz? | |
| releasedAt | timestamptz? | patient-visible only once set |
| createdAt / updatedAt | | |

Indexes: `(patientId, releasedAt)`, `hospitalId`. Audit: `REPORT_UPLOAD/AI_ANALYZE/VERIFY/VIEW/DOWNLOAD`.

### ImagingReport
Same shape as `LabReport` with `imagingType` and `findings` (text) replacing `reportType`/`structuredValues`; shares the identical `pipelineStatus` state machine and audit events (`REPORT_*`). Modeled as a separate table (not STI) because structured-value shapes genuinely differ; both are exposed through one unified `/reports` API surface (see [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)).

### Document
**Purpose:** Generic file attachment.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid? | null for a patient's own pre-visit upload not yet linked to a hospital encounter |
| ownerPatientId | uuid | FK → Patient |
| uploadedBy | uuid | FK → User |
| category | enum(`REPORT_ATTACHMENT`,`PRESCRIPTION_PDF`,`ID_PROOF`,`INSURANCE`,`OTHER`) | |
| linkedEntityType | string? | e.g. `LabReport`, `Consultation` |
| linkedEntityId | uuid? | |
| storageKey | string | object storage key, never a public URL |
| fileName | string | |
| mimeType | string | |
| sizeBytes | int | |
| createdAt / deletedAt | | |

Indexes: `ownerPatientId`, `(linkedEntityType, linkedEntityId)`. Audit: `DOCUMENT_UPLOAD/VIEW/DOWNLOAD`.

---

## Platform Services

### Notification
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User |
| type | string | e.g. `APPOINTMENT_REMINDER`, `REPORT_READY` |
| title / body | string | |
| channel | enum(`PUSH`,`EMAIL`,`SMS`,`IN_APP`) | |
| deliveryStatus | enum(`QUEUED`,`SENT`,`DELIVERED`,`FAILED`) | |
| relatedEntityType / relatedEntityId | string? / uuid? | |
| readAt | timestamptz? | |
| createdAt | | |

Indexes: `(userId, readAt)`, `deliveryStatus`. See [22-NOTIFICATIONS.md](22-NOTIFICATIONS.md).

### AuditLog
**Purpose:** Immutable, append-only trail. See [24-AUDIT-LOGGING.md](24-AUDIT-LOGGING.md).
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid? | null for platform-level (Super Admin) actions |
| actorUserId | uuid? | null only for system-initiated jobs |
| actorRole | string | role key at time of action (denormalized, survives role changes) |
| action | string | e.g. `APPOINTMENT_CANCEL` |
| resourceType | string | |
| resourceId | uuid? | |
| beforeState / afterState | jsonb? | |
| ipAddress | string? | |
| userAgent | string? | |
| reasonCode | string? | mandatory for Super Admin cross-tenant/break-glass access |
| createdAt | | |

No `updatedAt`/`deletedAt`; no application-level update/delete route exists at all. Indexes: `(hospitalId, createdAt)`, `(actorUserId, createdAt)`, `(resourceType, resourceId)`.

### DeviceSession
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User |
| deviceName | string? | |
| platform | enum(`IOS`,`ANDROID`,`WEB`) | |
| ipAddress | string? | |
| userAgent | string? | |
| lastActiveAt | timestamptz | |
| createdAt | | |
| revokedAt | timestamptz? | |

### RefreshToken
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| userId | uuid | FK → User |
| sessionId | uuid | FK → DeviceSession |
| tokenHash | string | never store raw token |
| familyId | uuid | shared across a rotation chain; reuse-after-rotation revokes the whole family |
| isUsed | boolean | default false |
| expiresAt | timestamptz | |
| createdAt | | |
| revokedAt | timestamptz? | |

Indexes: `(userId)`, `familyId`, unique `tokenHash`. See [16-AUTHENTICATION.md](16-AUTHENTICATION.md).

### OtpChallenge
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| identifier | string | email or phone |
| purpose | enum(`REGISTRATION`,`PASSWORD_RESET`,`LOGIN_VERIFICATION`,`ACCOUNT_ACTIVATION`) | |
| codeHash | string | |
| attempts | int | default 0 |
| maxAttempts | int | default 5 |
| expiresAt | timestamptz | |
| consumedAt | timestamptz? | |
| createdAt | | |

Indexes: `(identifier, purpose)`.

### HospitalSettings
**Purpose:** Structured per-hospital configuration (booking policy etc.) — modeled as typed columns rather than a generic key/value table for type safety, matching the `Settings` entity named in the brief.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| hospitalId | uuid | FK → Hospital, unique (1:1) |
| minBookingLeadMinutes | int | default 60 |
| maxAdvanceBookingDays | int | default 60 |
| cancellationWindowMinutes | int | default 120 |
| rescheduleWindowMinutes | int | default 120 |
| maxReschedulesPerAppointment | int | default 3 |
| autoConfirmBookings | boolean | default true |
| checkinWindowMinutes | int | default 30 |
| updatedAt | | |
| updatedBy | uuid | FK → User |

Audit: `SETTINGS_UPDATE`.

---

## Soft-delete & audit summary matrix

| Entity | Soft delete | Fully audited | Immutable after create |
|---|:---:|:---:|:---:|
| Hospital, Branch, Department | ✓ | ✓ | – |
| User, Patient, Doctor, Staff | ✓ | ✓ | – |
| Appointment | ✓ | ✓ (every transition) | – |
| Consultation, ClinicalNote, Diagnosis, Vital | – (finalized, not deleted) | ✓ | after `COMPLETED` |
| Prescription | – | ✓ | ✓ (correction = new row) |
| LabReport / ImagingReport | – | ✓ | after `RELEASED` |
| Document | ✓ | ✓ | ✓ (re-upload = new row) |
| AuditLog | – (never deleted) | n/a | ✓ fully |
| RefreshToken, DeviceSession, OtpChallenge | – (expire/revoke instead) | security events only | ✓ |
