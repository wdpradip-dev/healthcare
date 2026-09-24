# 02 — Personas and Roles

## Authorization model summary

Authorization is **permission-based**, not role-name-based. A Role is just a named, pre-configured bundle of Permissions; `SUPER_ADMIN` can create custom roles with custom permission bundles at a hospital's request (Post-MVP toggle; MVP ships the six fixed roles below, but the schema already supports custom roles — see [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md)).

Every permission also has an implicit **scope**:

| Scope | Meaning |
|---|---|
| `SELF` | Only records owned by/about the acting user (e.g. a Patient reading their own records). |
| `ASSIGNED` | Only records the user is clinically assigned to (e.g. a Doctor's own patients/appointments). |
| `BRANCH` | Any record within the user's assigned Branch(es). |
| `HOSPITAL` | Any record within the user's Hospital (all branches). |
| `PLATFORM` | Any record across all hospitals (`SUPER_ADMIN` only). |

A permission check is always `(permission, scope)`. The permission string tells you *what*; the scope, resolved from the user's role + assignment data, tells you *which rows*. This is enforced server-side in the NestJS authorization guard, never left to the client.

**`notifications.read` is always `SELF` scope, for every role, regardless of that role's stated default scope below.** A notification inbox is inherently self-referential (`notification.userId === user.id`) — there is no "assigned" or "branch" notification inbox — so this permission is the one deliberate exception to each role's per-section default scope, called out here once rather than repeated in every role's permission list.

## Canonical permission list

This is the authoritative list. New permissions must be added here first, then to [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md) and the seed data in [36-SEED-DATA.md](36-SEED-DATA.md).

```
hospitals.read          hospitals.write          # SUPER_ADMIN only (tenant onboarding)
branches.read           branches.write
departments.read        departments.write
users.read               users.manage             # create/deactivate/assign roles
roles.read                roles.manage
permissions.read

patients.read            patients.write
doctors.read              doctors.write
staff.read                 staff.write

schedules.read            schedules.write
appointments.read         appointments.create
appointments.update       appointments.cancel
appointments.checkin

consultations.read        consultations.write
medical_records.read      medical_records.write
prescriptions.read        prescriptions.write
lab_orders.read            lab_orders.write
reports.read                reports.upload            reports.verify
documents.read              documents.upload

notifications.read         notifications.manage
analytics.read
audit_logs.read
settings.manage
```

`reports.verify` covers the human-verification step in the AI-assisted report pipeline ([27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md)) — only clinical roles (Doctor, Admin) hold it.

## Roles

### PATIENT

**Goals:** Find the right doctor, book/manage appointments with minimal friction, see my own medical history and reports, stay informed.

**Permissions (scope `SELF` unless noted):**
`patients.read` (self), `patients.write` (self, limited fields), `doctors.read` (`PLATFORM`, discovery), `departments.read` (`PLATFORM`), `branches.read` (`PLATFORM`), `schedules.read` (`PLATFORM`, availability only), `appointments.read`, `appointments.create`, `appointments.update` (reschedule own), `appointments.cancel` (own), `appointments.checkin` (own, self-service check-in), `medical_records.read`, `prescriptions.read`, `reports.read`, `documents.read`, `documents.upload` (own pre-visit documents only), `notifications.read`.

**Screens:** Auth flow, Home, Doctor/Department search & profile, Booking flow, Appointments (upcoming/history/details), Medical dashboard, Medical history, Consultation details (read-only), Prescriptions, Lab/imaging reports, Documents, Notifications, Profile, Settings, Support, About/Privacy/Terms.

**Allowed operations:** Book/reschedule/cancel own appointments within policy windows; view own clinical data; upload own pre-visit documents; manage own profile/notification preferences.

**Restricted operations:** Cannot view any other patient's data. Cannot write clinical notes, diagnoses, or prescriptions. Cannot see analytics, audit logs, or admin/staff data. Cannot check in another patient.

**Data visibility:** Own record only, across all hospitals the patient has visited (patient identity is platform-level; clinical data is hospital-scoped and only visible for hospitals where the patient has an actual relationship).

---

### DOCTOR

**Goals:** See today's/upcoming schedule, have full patient context at the point of care, document consultations efficiently, issue prescriptions and order/review reports.

**Permissions (scope `ASSIGNED` unless noted):**
`patients.read` (assigned patients only), `appointments.read`, `appointments.update` (own schedule: complete/no-show), `appointments.checkin` (own), `schedules.read` (own, `SELF`), `schedules.write` (own availability/leave requests, `SELF`), `consultations.read`, `consultations.write`, `medical_records.read`, `medical_records.write`, `prescriptions.read`, `prescriptions.write`, `lab_orders.read`, `lab_orders.write`, `reports.read`, `reports.upload`, `reports.verify`, `documents.read`, `documents.upload`, `notifications.read`.

**Screens:** Login, Today's appointments, Patient details, Consultation workspace, Medical notes editor, Diagnosis entry, Prescription composer, Report upload/review, Follow-up scheduling, own Profile/Schedule.

**Allowed operations:** Full clinical documentation for patients they are seeing/have seen at their Hospital; order and verify reports; issue prescriptions; request leave/schedule changes (subject to Admin approval for published schedules).

**Restricted operations:** Cannot view patients they have no appointment/consultation relationship with. Cannot manage other doctors, staff, departments, or branches. Cannot see hospital-wide analytics or audit logs. Cannot change their own published schedule without going through exception/approval flow if policy requires it (configurable per hospital, see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)).

**Data visibility:** Assigned patients within their own Hospital only.

---

### NURSE

**Goals:** Support intake around a consultation — vitals, prep, coordination — without full prescribing authority.

**Permissions (scope `BRANCH` unless noted):**
`patients.read`, `appointments.read`, `appointments.checkin`, `schedules.read`, `consultations.read`, `medical_records.read`, `medical_records.write` (vitals/notes only, not diagnosis/prescription), `prescriptions.read`, `lab_orders.read`, `reports.read`, `documents.read`, `documents.upload`, `notifications.read`.

**Screens:** Today's appointments (branch-wide), Patient details, Vitals entry, Check-in, Queue view.

**Allowed operations:** Record vitals and intake notes, perform/confirm check-in, view (not author) diagnoses/prescriptions, upload supporting documents.

**Restricted operations:** No `prescriptions.write`, no `consultations.write` (cannot author diagnosis or clinical assessment), no staff/doctor/schedule management, no analytics/audit access.

**Data visibility:** Patients with an appointment at the Nurse's assigned Branch(es).

---

### RECEPTIONIST

**Goals:** Register patients, book/manage appointments, run the front-desk queue.

**Permissions (scope `BRANCH` unless noted):**
`patients.read`, `patients.write` (registration/contact-detail updates), `doctors.read`, `departments.read`, `schedules.read`, `appointments.read`, `appointments.create`, `appointments.update`, `appointments.cancel`, `appointments.checkin`, `notifications.read`.

**Screens:** Patient registration, Appointment booking, Check-in/Queue management, Reschedule/Cancel.

**Allowed operations:** Register new patients at their Branch; book/reschedule/cancel appointments on behalf of patients; manage the daily check-in queue.

**Restricted operations:** No clinical data write access (no `medical_records.write`, `prescriptions.write`, `consultations.write`). No staff/schedule template management. No analytics/audit access.

**Data visibility:** Patients and appointments at the Receptionist's assigned Branch(es).

---

### ADMIN (Hospital Admin)

**Goals:** Run one Hospital's operations — staffing, structure, schedules, oversight — with full visibility into that Hospital only.

**Permissions (scope `HOSPITAL` unless noted):**
`branches.read`, `branches.write`, `departments.read`, `departments.write`, `users.read`, `users.manage`, `roles.read`, `patients.read`, `patients.write`, `doctors.read`, `doctors.write`, `staff.read`, `staff.write`, `schedules.read`, `schedules.write`, `appointments.read`, `appointments.create`, `appointments.update`, `appointments.cancel`, `appointments.checkin`, `consultations.read`, `medical_records.read`, `prescriptions.read`, `reports.read`, `documents.read`, `notifications.read`, `notifications.manage`, `analytics.read`, `audit_logs.read`, `settings.manage`.

**Screens:** Full admin panel scoped to their Hospital: Dashboard, Patients, Doctors, Staff, Departments, Branches, Appointments, Calendar, Schedules, Reports, Documents, Notifications, Users, Roles (view/assign, not platform-level permission editing), Audit Logs, Analytics, Settings.

**Allowed operations:** Manage hospital structure and staffing; oversee (read) all clinical data for audit/operational purposes; configure hospital settings (booking policy, working hours defaults); view full analytics and audit logs for their Hospital.

**Restricted operations:** Cannot author clinical documentation (no `consultations.write`, `medical_records.write`, `prescriptions.write` — an Admin is not assumed to be a clinician; if a hospital's admin is also a doctor, that person holds both roles). Cannot access another Hospital's data. Cannot create/onboard new hospitals or edit the platform-level permission catalog.

**Data visibility:** Everything within their Hospital (all branches). Nothing outside it.

---

### SUPER_ADMIN (Platform Admin)

**Goals:** Onboard and operate the platform itself: create hospitals, manage the permission catalog, provide platform-level support, monitor cross-tenant health.

**Permissions (scope `PLATFORM`):** All permissions, across all hospitals, plus exclusive `hospitals.write` and permission-catalog management (`permissions.read`, extending `roles.manage` to custom role definitions).

**Screens:** Everything an ADMIN sees, plus a Hospital-switcher/platform view, Hospital onboarding, platform-wide settings, cross-tenant analytics (aggregate, non-clinical), platform audit logs.

**Allowed operations:** Create/suspend hospitals; impersonate-view (read-only, fully audited) a hospital's admin context for support; manage the platform permission/role catalog.

**Restricted operations:** Even `SUPER_ADMIN` clinical-data reads are fully audited and intended for support/compliance, not routine use — see [25-SECURITY.md](25-SECURITY.md) for the "break-glass" access pattern.

**Data visibility:** All hospitals. Every cross-tenant read is audit-logged with a mandatory reason code.

## Role → Permission matrix (quick reference)

| Permission | PATIENT | NURSE | RECEPTIONIST | DOCTOR | ADMIN | SUPER_ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| patients.read | self | branch | branch | assigned | hospital | platform |
| patients.write | self | – | branch | – | hospital | platform |
| doctors.read | platform | – | branch | – | hospital | platform |
| doctors.write | – | – | – | – | hospital | platform |
| staff.write | – | – | – | – | hospital | platform |
| schedules.write | – | – | – | self | hospital | platform |
| appointments.create | self | – | branch | – | hospital | platform |
| appointments.checkin | self | branch | branch | self | hospital | platform |
| consultations.write | – | – | – | assigned | – | platform* |
| medical_records.write | – | branch (vitals) | – | assigned | – | platform* |
| prescriptions.write | – | – | – | assigned | – | platform* |
| reports.verify | – | – | – | assigned | – | platform* |
| analytics.read | – | – | – | – | hospital | platform |
| audit_logs.read | – | – | – | – | hospital | platform |
| users.manage | – | – | – | – | hospital | platform |
| settings.manage | – | – | – | – | hospital | platform |

\* `SUPER_ADMIN` clinical-write capability exists only for support/data-correction scenarios, is disabled by default, and requires break-glass activation — see [25-SECURITY.md](25-SECURITY.md).
