# 37 — API Examples

Concrete request/response payloads for the highest-traffic endpoints, illustrating the conventions in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md). All examples use the fixture names from [36-SEED-DATA.md](36-SEED-DATA.md).

## `POST /auth/register`

Request:
```json
{
  "name": "Alice Kumar",
  "email": "alice.kumar@example.com",
  "phone": "+15550102",
  "password": "SecurePass1",
  "acceptedTerms": true
}
```
Response `201`:
```json
{
  "data": {
    "userId": "b3f1...uuid",
    "status": "PENDING_ACTIVATION",
    "otpChallengeId": "1a2b...uuid",
    "otpDeliveredTo": "a****@example.com"
  }
}
```
Error `409`:
```json
{ "error": { "code": "AUTH_EMAIL_ALREADY_EXISTS", "message": "This email is already registered.", "details": [] } }
```

## `POST /auth/login`

Request:
```json
{ "identifier": "alice.kumar@example.com", "password": "SecurePass1" }
```
Response `200`:
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "9f8e7d6c-....",
    "user": {
      "id": "b3f1...uuid",
      "name": "Alice Kumar",
      "roles": ["PATIENT"],
      "permissions": ["patients.read", "appointments.create", "..."]
    }
  }
}
```

## `GET /doctors?departmentId=cardio-uuid&availableToday=true&page=1`

Response `200`:
```json
{
  "data": [
    {
      "id": "doc-sarah-patel-uuid",
      "name": "Dr. Sarah Patel",
      "specialty": "Cardiology",
      "hospital": { "id": "hosp-city-general", "name": "City General Hospital" },
      "branch": { "id": "branch-main", "name": "Main Branch" },
      "photoUrl": "https://.../doc-sarah-patel.jpg",
      "nextAvailableSlot": "2026-08-08T09:00:00-05:00",
      "consultationFee": 50
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1 }
}
```

## `GET /schedules/availability?doctorId=doc-sarah-patel-uuid&from=2026-08-08&to=2026-08-08`

Response `200`:
```json
{
  "data": {
    "doctorId": "doc-sarah-patel-uuid",
    "days": [
      {
        "date": "2026-08-08",
        "hasSlots": true,
        "slots": [
          { "startTime": "2026-08-08T09:00:00-05:00", "endTime": "2026-08-08T09:20:00-05:00" },
          { "startTime": "2026-08-08T09:25:00-05:00", "endTime": "2026-08-08T09:45:00-05:00" }
        ]
      }
    ]
  }
}
```

## `POST /appointments`

Request:
```json
{
  "doctorId": "doc-sarah-patel-uuid",
  "departmentId": "cardio-uuid",
  "patientId": "patient-alice-kumar-uuid",
  "startTime": "2026-08-08T09:00:00-05:00",
  "reason": "Annual checkup"
}
```
Response `201`:
```json
{
  "data": {
    "id": "appt-10234-uuid",
    "status": "CONFIRMED",
    "doctorId": "doc-sarah-patel-uuid",
    "patientId": "patient-alice-kumar-uuid",
    "startTime": "2026-08-08T09:00:00-05:00",
    "endTime": "2026-08-08T09:20:00-05:00",
    "reason": "Annual checkup",
    "createdAt": "2026-08-01T14:02:11Z"
  }
}
```
Conflict `409` (lost the race):
```json
{ "error": { "code": "APPOINTMENT_CONFLICT", "message": "This slot is no longer available.", "details": [] } }
```

## `PATCH /appointments/:id/reschedule`

Request:
```json
{ "newStartTime": "2026-08-09T10:00:00-05:00" }
```
Response `200`:
```json
{
  "data": {
    "id": "appt-10234-uuid",
    "status": "CONFIRMED",
    "startTime": "2026-08-09T10:00:00-05:00",
    "endTime": "2026-08-09T10:20:00-05:00",
    "rescheduleCount": 1
  }
}
```

## `POST /appointments/:id/checkin`

Response `200`:
```json
{ "data": { "id": "appt-10234-uuid", "status": "CHECKED_IN", "queueNumber": 12, "checkedInAt": "2026-08-08T08:45:03Z" } }
```

## `POST /consultations/:id/complete`

Request:
```json
{
  "diagnosis": [{ "icd10Code": "I10", "description": "Essential hypertension" }],
  "notes": [{ "content": "Patient reports mild headaches, advised salt reduction.", "isInternal": false }]
}
```
Response `200`:
```json
{ "data": { "id": "consult-uuid", "status": "COMPLETED", "completedAt": "2026-08-08T09:18:44Z" } }
```

## `POST /prescriptions`

Request:
```json
{
  "consultationId": "consult-uuid",
  "items": [
    { "medicationId": "med-amoxicillin-uuid", "dosage": "500mg", "frequency": "Twice daily", "durationDays": 7, "instructions": "After food" }
  ]
}
```
Response `201`:
```json
{
  "data": {
    "id": "rx-uuid",
    "status": "ACTIVE",
    "issuedAt": "2026-08-08T09:15:00Z",
    "items": [
      { "id": "rxi-uuid", "medicationName": "Amoxicillin", "dosage": "500mg", "frequency": "Twice daily", "durationDays": 7, "instructions": "After food" }
    ]
  }
}
```

## `GET /reports/:id` (patient, after release)

Response `200`:
```json
{
  "data": {
    "id": "report-cbc-uuid",
    "type": "lab",
    "reportType": "Complete Blood Count",
    "status": "RELEASED",
    "releasedAt": "2026-08-01T16:00:00Z",
    "orderedBy": { "id": "doc-sarah-patel-uuid", "name": "Dr. Sarah Patel" },
    "structuredValues": [
      { "name": "Hemoglobin", "value": 14.2, "unit": "g/dL", "referenceRange": "13.5-17.5", "flag": "NORMAL" },
      { "name": "WBC Count", "value": 11.8, "unit": "x10^9/L", "referenceRange": "4.0-11.0", "flag": "HIGH" }
    ],
    "aiGenerated": true,
    "aiSummary": "Mildly elevated WBC, consistent with a recent minor infection. Recommend routine follow-up if symptoms persist.",
    "verifiedBy": { "id": "doc-sarah-patel-uuid", "name": "Dr. Sarah Patel" },
    "verifiedAt": "2026-08-01T15:50:00Z"
  }
}
```
Before release (`403`):
```json
{ "error": { "code": "REPORT_ACCESS_DENIED", "message": "This report is not yet available.", "details": [] } }
```

## `GET /analytics/overview?range=7d&branchId=branch-main`

Response `200`:
```json
{
  "data": {
    "totalPatients": 4812,
    "todaysAppointments": 86,
    "completed": 61,
    "cancelled": 4,
    "noShows": 3,
    "doctorUtilizationPct": 78
  }
}
```

## `GET /audit-logs?resourceType=Appointment&resourceId=appt-10234-uuid`

Response `200`:
```json
{
  "data": [
    { "id": "log-1", "action": "APPOINTMENT_CREATE", "actorName": "Alice Kumar", "actorRole": "PATIENT", "createdAt": "2026-08-01T14:02:11Z" },
    { "id": "log-2", "action": "APPOINTMENT_CHECKIN", "actorName": "Meera Nair", "actorRole": "RECEPTIONIST", "createdAt": "2026-08-08T08:45:03Z" },
    { "id": "log-3", "action": "APPOINTMENT_COMPLETE", "actorName": "Dr. Sarah Patel", "actorRole": "DOCTOR", "createdAt": "2026-08-08T09:18:44Z" }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 3, "totalPages": 1 }
}
```

## Cross-tenant access attempt

`GET /patients/:id` where `:id` belongs to a different hospital than the requester:
```json
{ "error": { "code": "NOT_FOUND", "message": "Patient not found.", "details": [] } }
```
(Not `403` — see [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md) for why cross-tenant lookups never disambiguate existence.)
