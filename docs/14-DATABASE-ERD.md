# 14 — Database ERD

Entity/field detail: [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md). Diagrams split by domain for readability; all entities share the same underlying schema.

## Identity & Tenancy

```mermaid
erDiagram
    HOSPITAL ||--o{ BRANCH : has
    BRANCH ||--o{ DEPARTMENT : has
    HOSPITAL ||--o{ USER : "employs (staff/doctor)"
    USER ||--o| PATIENT : "is a"
    USER ||--o| DOCTOR : "is a"
    USER ||--o| STAFF : "is a"
    USER ||--o{ USER_ROLE : has
    ROLE ||--o{ USER_ROLE : "assigned via"
    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : "granted via"
    HOSPITAL ||--o| HOSPITAL_SETTINGS : configures
    DOCTOR }o--o{ DEPARTMENT : "practices in (via DoctorDepartment)"
    STAFF }o--|| BRANCH : "assigned to"
```

## Scheduling & Appointments

```mermaid
erDiagram
    DOCTOR ||--o{ DOCTOR_SCHEDULE : defines
    DOCTOR ||--o{ SCHEDULE_EXCEPTION : has
    BRANCH ||--o{ SCHEDULE_EXCEPTION : "branch-wide"
    DOCTOR ||--o{ APPOINTMENT : sees
    PATIENT ||--o{ APPOINTMENT : books
    DEPARTMENT ||--o{ APPOINTMENT : "held in"
    APPOINTMENT ||--o{ APPOINTMENT_HISTORY : logs
    APPOINTMENT ||--o| CONSULTATION : "produces (1:1)"
```

## Clinical Records

```mermaid
erDiagram
    CONSULTATION ||--o{ CLINICAL_NOTE : contains
    CONSULTATION ||--o{ DIAGNOSIS : contains
    CONSULTATION ||--o{ VITAL : contains
    CONSULTATION ||--o{ PRESCRIPTION : issues
    CONSULTATION ||--o{ LAB_ORDER : orders
    PRESCRIPTION ||--o{ PRESCRIPTION_ITEM : lists
    MEDICATION ||--o{ PRESCRIPTION_ITEM : "referenced by"
    PRESCRIPTION ||--o| PRESCRIPTION : supersedes
    LAB_ORDER ||--o{ LAB_REPORT : produces
    LAB_ORDER ||--o{ IMAGING_REPORT : produces
    PATIENT ||--o{ MEDICAL_CONDITION : has
    PATIENT ||--o{ ALLERGY : has
    PATIENT ||--o{ DOCUMENT : owns
    LAB_REPORT ||--o{ DOCUMENT : "attached file"
    IMAGING_REPORT ||--o{ DOCUMENT : "attached file"
```

## Platform Services

```mermaid
erDiagram
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ DEVICE_SESSION : "logs in from"
    DEVICE_SESSION ||--o{ REFRESH_TOKEN : issues
    HOSPITAL ||--o{ AUDIT_LOG : scopes
    USER ||--o{ AUDIT_LOG : performs
```

## Full entity relationship summary (text form)

| Parent | Relationship | Child | Cardinality |
|---|---|---|---|
| Hospital | owns | Branch | 1:N |
| Branch | contains | Department | 1:N |
| Hospital | employs | User (staff/doctor) | 1:N |
| User | is | Patient / Doctor / Staff | 1:0..1 each (mutually typical, not enforced exclusive at DB level — a user is expected to occupy exactly one of these in practice) |
| Doctor | practices in | Department | N:M via DoctorDepartment |
| Doctor | defines | DoctorSchedule | 1:N |
| Doctor / Branch | has | ScheduleException | 1:N |
| Doctor, Patient, Department | produce | Appointment | N:1 each |
| Appointment | logs to | AppointmentHistory | 1:N |
| Appointment | produces | Consultation | 1:1 |
| Consultation | contains | ClinicalNote, Diagnosis, Vital | 1:N each |
| Consultation | issues | Prescription | 1:N |
| Prescription | lists | PrescriptionItem | 1:N |
| Prescription | supersedes | Prescription | 0..1 self-referential |
| Consultation | orders | LabOrder | 1:N |
| LabOrder | produces | LabReport / ImagingReport | 1:N |
| Patient | has | MedicalCondition, Allergy, Document | 1:N each |
| LabReport / ImagingReport | attaches | Document | 1:N |
| User | receives | Notification | 1:N |
| User | authenticates via | DeviceSession → RefreshToken | 1:N → 1:N |
| Hospital / User | performs | AuditLog | 1:N each |
| Role | grants | Permission | N:M via RolePermission |
| User | assigned | Role | N:M via UserRole |
| Hospital | configures | HospitalSettings | 1:1 |

## Tenant-boundary rule (visual)

```mermaid
flowchart LR
    subgraph "Hospital A (tenant boundary)"
        A_B[Branch] --> A_D[Department]
        A_Doc[Doctor] --> A_D
        A_D --> A_Appt[Appointment]
        A_P[Patient relationship] --> A_Appt
    end
    subgraph "Hospital B (tenant boundary)"
        B_B[Branch] --> B_D[Department]
        B_Doc[Doctor] --> B_D
        B_D --> B_Appt[Appointment]
        B_P[Patient relationship] --> B_Appt
    end
    Patient((Patient identity\nplatform-level)) --> A_P
    Patient --> B_P
```

A single `Patient` identity can hold relationships (appointments, records) in both Hospital A and Hospital B, but every clinical row (`Appointment`, `Consultation`, `Prescription`, `LabReport`, …) carries exactly one `hospitalId` and is never joined across tenants except by `SUPER_ADMIN` platform queries. See [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md).
