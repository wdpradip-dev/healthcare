# 09 — Admin Design Mockups

Textual wireframes for all 25 admin console screens. Shell (sidebar + topbar) is shown once; subsequent screens show only the content area. Role visibility per module is defined in [06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md).

## Shell
```
------------------------------------------------------------------
[Logo] City General Hospital ▾     [🔍 Search]      [🔔5] [Avatar▾]
------------------------------------------------------------------
| Dashboard        |  Patients                                    
| Patients         |  ------------------------------------------- 
| Doctors          |  Home / Patients                             
| Staff            |  ------------------------------------------- 
| Departments      |                                               
| Branches         |  [ content area ]                             
| Appointments     |                                               
| Calendar         |                                               
| Doctor Schedules |                                               
| Consultations    |                                               
| Reports          |                                               
| Documents        |                                               
| Notifications    |                                               
| Users            |                                               
| Roles            |                                               
| Audit Logs       |                                               
| Analytics        |                                               
| Settings         |                                               
------------------------------------------------------------------
```
Sidebar renders only modules the current permission set unlocks. Hospital switcher in topbar appears only for `SUPER_ADMIN`.

---

### Dashboard
```
Dashboard                                    [ This Week ▾ ] [ Branch: All ▾ ]

[ Total Patients   4,812 ]  [ Today's Appts   86 ]  [ Completed   61 ]
[ Cancelled   4 ]           [ No-Shows   3 ]         [ Doctor Utilization 78% ]

Appointment Trend (30 days)              Department Load
[ line chart ]                            [ horizontal bar chart ]

Patient Registrations (30 days)          Recent Activity
[ bar chart ]                             [ audit-style activity feed, 5 rows ]
```
| | |
|---|---|
| API | `GET /analytics/overview?range=&branchId=` |
| Permission | `analytics.read` (hospital scope); Doctor role sees a reduced personal-only variant (own day's appointments count, no hospital-wide cards) — see [23-ANALYTICS-AND-REPORTING.md](23-ANALYTICS-AND-REPORTING.md) |
| Loading | Skeleton KPI cards + skeleton chart frames |
| Empty | New hospital with no data → cards show 0 with "Get started" hints, charts show empty-state illustration |
| Error | Per-widget retry, dashboard doesn't fail wholesale if one metric errors |

### Patients
```
Patients                                          [ + New Patient ]

[ 🔍 Search patients ]  [ Branch ▾ ] [ Status ▾ ]        columns ⚙

Name          Phone           Branch        Last Visit    ⋮
Alice Kumar   +1 555-0102     Main Branch   2 Aug 2026     ⋮
Ben Ortiz     +1 555-0177     Riverside     28 Jul 2026    ⋮

                                            ‹ 1 2 3 … 24 ›
```
| API | `GET /patients?query=&branchId=&status=&page=` | Permission | `patients.read` (hospital) | Interaction | Row click → Patient Details; ⋮ → Edit/Deactivate |

### Patient Details
```
[ < ]  Alice Kumar                      [ Edit ] [ ⋮ ]

Overview | Appointments | Medical History | Documents

Overview tab:
DOB, Gender, Phone, Email, Address, Emergency Contact
Registered Branch: Main Branch · Since 12 Jan 2024

Medical History tab (read-only oversight):
[ Aug 2  Consultation · Dr. Patel · Hypertension ]
[ Jul 28 Lab Report · Complete Blood Count       ]
```
| API | `GET /patients/:id`, `GET /medical-records?patientId=` | Permission | `patients.read`, `medical_records.read` (hospital, oversight — no `medical_records.write` for Admin) |

### Doctors
```
Doctors                                          [ + Add Doctor ]

[ 🔍 Search ]  [ Department ▾ ] [ Branch ▾ ] [ Status ▾ ]

Name            Department    Branch         Status     ⋮
Dr. Sarah Patel Cardiology    Main Branch    Active      ⋮
Dr. Raj Mehta   Pediatrics    Riverside      On Leave    ⋮
```
### Doctor Details
```
[ < ]  Dr. Sarah Patel                    [ Edit ] [ ⋮ ]

Profile | Schedule | Patients | Reviews

Profile: bio, qualifications, specialties, branches,
consultation duration, fee, status toggle

Schedule tab: weekly template + upcoming exceptions
(links to Doctor Schedules screen filtered to this doctor)
```
| API | `GET /doctors/:id`, `PATCH /doctors/:id` | Permission | `doctors.write` |

### Staff
```
Staff                                            [ + Invite Staff ]

Name          Role            Branch          Status      ⋮
Meera Nair    Receptionist    Main Branch     Active       ⋮
John Lee      Nurse           Riverside       Pending      ⋮
```
### Staff Details
```
[ < ]  Meera Nair                          [ Edit ] [ ⋮ ]

Role: Receptionist   Branch: Main Branch   Status: Active
Contact info, invitation history, active sessions
[ Force Logout All Sessions ]
```
| API | `POST /users/invite`, `GET /staff/:id`, `PATCH /staff/:id`, `DELETE /auth/sessions?userId=` | Permission | `staff.write`, `users.manage` |

### Departments
```
Departments                                      [ + Add Department ]

Name            Branch          Doctors    Status     ⋮
Cardiology      Main Branch     4          Active      ⋮
Pediatrics      Riverside       3          Active      ⋮
```
### Branches
```
Branches                                          [ + Add Branch ]

Name             Address                  Departments  Status  ⋮
Main Branch      12 Elm St, Springfield   8            Active   ⋮
Riverside        44 River Rd, Springfield 5            Active   ⋮
```
| API | `/departments`, `/branches` CRUD | Permission | `departments.write`, `branches.write` |

### Appointments
```
Appointments                                [ + New Appointment ]

[ 🔍 Search ] [ Branch ▾ ] [ Doctor ▾ ] [ Status ▾ ] [ Date range ▾ ]

Patient        Doctor         Date/Time        Status        ⋮
Alice Kumar    Dr. Patel      Aug 8, 9:00 AM   Confirmed      ⋮
Ben Ortiz      Dr. Mehta      Aug 8, 11:00 AM  Checked In     ⋮
```
### Appointment Details
```
[ < ]  Appointment #A-10234                Status: Confirmed

Patient: Alice Kumar        Doctor: Dr. Sarah Patel
Branch: Main Branch         Date/Time: Aug 8, 9:00 AM
Reason: Annual checkup

[ Reschedule ]  [ Cancel ]  [ Check In ]

History
[ Created · Aug 1 by Alice Kumar (patient) ]
```
| API | `GET /appointments`, `GET /appointments/:id`, plus lifecycle endpoints | Permission | `appointments.read/update/cancel/checkin` (hospital); staff overrides require reason, logged |

### Calendar
```
Calendar                          Day | Week | Month   ◀ Aug 8 ▶

        Dr. Patel        Dr. Mehta        Dr. Shah
9:00    Alice Kumar       —                 —
9:30    —                 Ben Ortiz         —
10:00   —                 —                 Carla Diaz
```
Doctor-column time-grid, color-coded by status, click cell → Appointment Details, drag-to-reschedule (admin/reception only, with confirmation dialog). | API | `GET /appointments?view=calendar&from=&to=` |

### Doctor Schedules
```
Doctor Schedules                    [ Doctor: Dr. Sarah Patel ▾ ]

Weekly Template                              [ Edit Template ]
Mon-Fri  9:00 AM–1:00 PM, 2:00 PM–6:00 PM
Slot duration: 20 min   Buffer: 5 min   Max/day: 24
Sat      9:00 AM–12:00 PM
Sun      Closed

Upcoming Exceptions                          [ + Add Exception ]
Aug 15  Holiday — Independence Day (full day off)
```
| API | `GET/PUT /schedules/:doctorId`, `GET/POST /schedules/:doctorId/exceptions` | Permission | `schedules.write` (Doctor: own only via `SELF` scope, Admin: any within hospital) |

### Schedule Exceptions
```
[ < ]  Add Schedule Exception — Dr. Sarah Patel

Type:  ( Leave ) ( Holiday ) ( Extended Hours )
Date range: < Aug 15 > to < Aug 15 >
Reason: < Independence Day >
Affected appointments: 3 found → [ Notify & Reschedule ] [ Notify & Cancel ]

[ Save Exception ]
```
Creating a past-dated-conflict exception forces the admin to resolve existing appointments in that window before saving (business rule enforced client + server side, see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)).

### Consultation Workspace (Doctor/Nurse)
```
[ < ]  Alice Kumar · Consultation                [ Complete ]

Vitals            Notes           Diagnosis        Rx        Reports
--------------------------------------------------------------------
BP < 128/82 >  HR < 76 >  Temp < 98.4 >  Wt < 72 >

Clinical Notes
< rich text editor, autosaves every 30s >
☐ Internal only (not visible to patient)

Diagnosis
[ + Add Diagnosis ]  ICD-10 search < hypertension → I10 >

Prescriptions                                [ + Add Medication ]
1. Amoxicillin 500mg · Twice daily · 7 days       [ remove ]

Order Reports                                 [ + Order Report ]
```
| API | `POST/PATCH /consultations/:id`, `POST /prescriptions`, `POST /reports` (order) | Permission | `consultations.write`, `medical_records.write`, `prescriptions.write` — Nurse sees Vitals tab only, other tabs read-only or hidden | Interaction | "Complete" disabled until at least one diagnosis or note present; confirmation dialog states the record becomes patient-visible |

### Reports
```
Reports                                    [ Status: All ▾ ]

Patient       Type        Ordered By     Status          ⋮
Alice Kumar   Lab (CBC)   Dr. Patel      Released         ⋮
Ben Ortiz     Imaging     Dr. Mehta      Pending Review    ⋮
```
### Report Details (admin oversight)
```
[ < ]  Complete Blood Count — Alice Kumar

Status: Pending Review              [ Verify & Release ] (doctor only)
Ordered by Dr. Patel · Aug 1, 2026

Structured values ...
Access Log
[ Dr. Patel viewed · Aug 2, 10:14 AM ]
```
| API | `GET /reports`, `GET /reports/:id`, `POST /reports/:id/verify` | Permission | `reports.read` (oversight), `reports.verify` (Doctor only) |

### Documents
```
Documents                                    [ Type: All ▾ ]

File                    Linked To         Uploaded By    ⋮
Insurance Card.pdf      Alice Kumar        Patient         ⋮
Chest X-Ray.jpg          Ben Ortiz · Report Dr. Mehta      ⋮
```
### Notifications (admin)
```
Notifications                    Delivery Health | Templates

Delivery Health:
Push  98.2% delivered (last 24h)   [ 12 failed → view ]
Email 99.6% delivered               [ 2 failed → view ]

Templates:
Appointment Reminder   [ Edit ]
Report Ready            [ Edit ]
```
| API | `GET /notifications/health`, `GET/PUT /notifications/templates` | Permission | `notifications.manage` |

### Users
```
Users                                        [ + Invite User ]

Name          Email               Roles            Status   ⋮
Dr. S. Patel  s.patel@hosp.com    DOCTOR            Active    ⋮
Meera Nair    m.nair@hosp.com     RECEPTIONIST       Active    ⋮
```
### Roles
```
Roles                                (Super Admin: [ + New Role ])

Role            Users   Permissions
PATIENT         4,812   12 permissions   → view
DOCTOR          18      15 permissions   → view
NURSE           7       11 permissions   → view
RECEPTIONIST    5       9 permissions    → view
ADMIN           2       20 permissions   → view
```
Clicking a role opens a read-only permission list for `ADMIN`; `SUPER_ADMIN` gets checkboxes to build/edit custom roles from the canonical [Permission catalog](02-PERSONAS-AND-ROLES.md).

### Permissions (Super Admin only)
```
Permission Catalog                            [ + New Permission ]

Resource          Actions                                    
patients           read, write                                
appointments        read, create, update, cancel, checkin      
medical_records      read, write                               
```
| API | `GET/POST /users`, `GET/PATCH /roles`, `GET /permissions` | Permission | `users.manage`, `roles.manage`, `permissions.read` |

### Audit Logs
```
Audit Logs                                     [ Export CSV ]

[ Actor ▾ ] [ Action ▾ ] [ Resource ▾ ] [ Date range ▾ ]

Timestamp           Actor            Action                  Resource
Aug 8, 9:03 AM       Dr. Sarah Patel  CONSULTATION_COMPLETE    Appt #A-10234
Aug 8, 8:47 AM       Meera Nair       APPOINTMENT_CHECKIN       Appt #A-10234
Aug 8, 8:01 AM       System           AUTH_LOGIN                 Dr. Sarah Patel
```
| API | `GET /audit-logs?actor=&action=&resource=&from=&to=` | Permission | `audit_logs.read` | Interaction | Row expand → full before/after diff for update events, IP + user agent |

### Analytics
```
Analytics                          [ This Month ▾ ] [ Branch: All ▾ ]

Appointment Trends        Cancellation/No-Show Rate
[ line chart ]              [ line chart ]

Doctor Utilization          Department Load
[ horizontal bars ]           [ horizontal bars ]

Patient Registration Trend
[ bar chart ]
```
Dashboard KPI definitions:

| Metric | Definition |
|---|---|
| Total Patients | Distinct patients with ≥1 appointment/registration at this Hospital, non-deleted |
| Today's Appointments | Count where `date = today` and `hospitalId = current` |
| Completed | Today's appointments with `status = COMPLETED` |
| Cancelled | Today's appointments with `status = CANCELLED` |
| No-Shows | Today's appointments with `status = NO_SHOW` |
| Doctor Utilization | `booked slots / available slots` per doctor, averaged, selected range |
| Department Statistics | Appointment volume + completion rate per department |
| Appointment Trends | Daily appointment counts, selected range |
| Patient Registration Trends | Daily new-patient counts, selected range |

Metrics are never exposed to roles lacking `analytics.read` — Doctor/Nurse/Receptionist get zero analytics endpoints, not a filtered response (403, not silent omission).

### Settings
```
Settings                    General | Booking Policy | Branding | Team

Booking Policy tab:
Minimum booking lead time      < 1 hour >
Maximum advance booking         < 60 days >
Cancellation window             < 2 hours >
Reschedule window                < 2 hours >
Max reschedules per appointment  < 3 >
Auto-confirm bookings            ( ● On )
Check-in window (before start)   < 30 minutes >
```
| API | `GET/PUT /settings` | Permission | `settings.manage` — Super Admin has an additional "Platform" tab (hospital onboarding, global permission catalog, default policy templates) |
