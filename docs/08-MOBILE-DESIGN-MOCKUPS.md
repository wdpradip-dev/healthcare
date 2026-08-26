# 08 — Mobile Design Mockups

Textual wireframes + full behavior spec for all 35 patient mobile screens. Conventions: `[ Button ]` = filled button, `( Chip )` = chip/tag, `< Field >` = text input, `▾` = dropdown/expandable. All screens use the MD3 component set from [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md).

Each screen entry has: wireframe, then a compact fact table (Navigation / Header / API / Loading / Empty / Error / Permission / Interaction / Accessibility).

---

## Authentication

### Splash
```
------------------------------------------------
                                                  
                [ Hospital Logo ]                
                                                  
              Calm. Trusted. Care.               
                                                  
              (auto-advances ~1.2s)              
------------------------------------------------
```
| | |
|---|---|
| Navigation | Auto-routes to Welcome (unauthenticated) or Home (valid session found) after silent token check |
| API | `POST /auth/refresh` (silent) |
| Loading | The splash itself is the loading state |
| Error | Silent failure → Welcome |
| Accessibility | Screen-reader announces app name once; no interactive elements |

### Welcome
```
------------------------------------------------
                [ Hospital Logo ]                
                                                  
     Book appointments. Access your records.     
            All in one trusted app.              
                                                  
        [ Create Account ]                       
        [ Log In ]                                
                                                  
   By continuing you agree to Terms & Privacy    
------------------------------------------------
```
| | |
|---|---|
| Navigation | → Register / → Login; footer links → Terms, Privacy |
| API | None |
| Accessibility | Two primary actions clearly labeled; footer links are separate focus stops |

### Login
```
------------------------------------------------
[ < ]                                            
                                                  
  Welcome back                                   
                                                  
  < Email or phone >                              
  < Password >                          [ 👁 ]    
                                                  
  Forgot password?                                
                                                  
  [ Log In ]                                      
                                                  
  Don't have an account?  Sign up                 
------------------------------------------------
```
| | |
|---|---|
| Navigation | → Home on success; → OTP Verification if unverified; → Forgot Password |
| API | `POST /auth/login` |
| Loading | Button shows spinner, fields disabled |
| Error | Inline banner: "Incorrect email or password" (`AUTH_INVALID_CREDENTIALS`); lockout banner with countdown (`AUTH_ACCOUNT_LOCKED`) |
| Permission | Public |
| Interaction | Password visibility toggle; Enter key submits |
| Accessibility | Error banner uses `role=alert`; label/input pairing explicit |

### Register
```
------------------------------------------------
[ < ]                                            
                                                  
  Create your account                             
                                                  
  < Full name >                                   
  < Email >                                       
  < Phone >                                       
  < Password >                          [ 👁 ]    
  ( ) I agree to Terms & Privacy                  
                                                  
  [ Create Account ]                              
                                                  
  Already have an account?  Log in                
------------------------------------------------
```
| | |
|---|---|
| Navigation | → OTP Verification on success |
| API | `POST /auth/register` |
| Error | Field-level `VALIDATION_ERROR`; `AUTH_EMAIL_ALREADY_EXISTS` inline under email field |
| Permission | Public |
| Interaction | Live password-strength hint below field; submit disabled until terms checked |
| Accessibility | Checkbox has full-sentence label, not just "I agree" |

### OTP Verification
```
------------------------------------------------
[ < ]                                            
                                                  
  Verify your number                              
  We sent a code to +1 ***-***-4821               
                                                  
  [ _ ] [ _ ] [ _ ] [ _ ] [ _ ] [ _ ]              
                                                  
  Resend code in 0:28                              
                                                  
  [ Verify ]                                       
------------------------------------------------
```
| | |
|---|---|
| Navigation | → Home on success |
| API | `POST /auth/verify-otp`, `POST /auth/resend-otp` |
| Error | Shake animation + "Incorrect code" (`AUTH_OTP_INVALID`); "Code expired, resend" (`AUTH_OTP_EXPIRED`); lockout message (`AUTH_OTP_MAX_ATTEMPTS`) |
| Interaction | Auto-advances between digit boxes; auto-submits on 6th digit; resend button disabled during cooldown countdown |
| Accessibility | Countdown announced politely (`aria-live=polite`), not interrupting |

### Forgot Password
```
------------------------------------------------
[ < ]                                            
                                                  
  Reset your password                             
  Enter the email or phone on your account        
                                                  
  < Email or phone >                              
                                                  
  [ Send Code ]                                   
------------------------------------------------
```
| API | `POST /auth/forgot-password` |
| Navigation | → OTP Verification (reset mode) → Reset Password |

### Reset Password
```
------------------------------------------------
                                                  
  Set a new password                              
                                                  
  < New password >                       [ 👁 ]  
  < Confirm password >                            
                                                  
  Password must have 8+ characters,               
  one uppercase letter, one number                
                                                  
  [ Reset Password ]                               
------------------------------------------------
```
| API | `POST /auth/reset-password` | Navigation | → Login (all sessions revoked) |

---

## Patient Home

### Home
```
------------------------------------------------
[ Hospital Logo ]                     [ 🔔 3 ]
                                                  
Good morning, John                                
                                                  
[ Upcoming Appointment Card               ]      
[ Dr. Sarah Patel · Cardiology             ]      
[ City General Hospital · Today, 4:30 PM   ]      
[ [ View Appointment ]                     ]      
                                                  
Quick Actions                                     
[ Book Appointment ] [ Doctors ] [ Departments ]  
                                                  
Recent Reports                    View All →      
[ Blood Test · 12 Aug 2026 · Available ]          
                                                  
Bottom Navigation                                 
Home | Appointments | Records | Profile           
------------------------------------------------
```
| | |
|---|---|
| Navigation | Bell → Notifications; card → Appointment Details; Quick Actions → Booking flow / Doctor List / Department List; report row → Report Details |
| Header | Logo + greeting (time-of-day aware) + notification bell with unread badge |
| Data | Next upcoming appointment (if any), up to 3 recent reports |
| API | `GET /appointments?status=upcoming&limit=1`, `GET /reports?limit=3` |
| Loading | Skeleton card + skeleton list rows |
| Empty | No upcoming appointment → card replaced with "No upcoming appointments — Book one" CTA; no reports → section hidden entirely |
| Error | Inline retry card per section (sections fail independently) |
| Permission | `appointments.read` (self), `reports.read` (self) |
| Accessibility | Greeting and card content read as one block by screen reader; badge count announced |

### Notifications
```
------------------------------------------------
[ < ]  Notifications              Mark all read  
                                                  
Today                                             
[ 🔔 Appointment reminder                  ]     
[    Dr. Patel · Today 4:30 PM · 1h ago    ]     
                                                  
[ 📄 Report ready                          ]     
[    Blood Test results available · 3h ago ]     
                                                  
Earlier                                           
[ ✅ Appointment confirmed · Yesterday      ]     
------------------------------------------------
```
| | |
|---|---|
| Navigation | Tap item → deep-link to source (appointment/report/prescription) |
| API | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |
| Empty | Illustration + "You're all caught up" |
| Interaction | Swipe-to-dismiss (mark read); unread items have Primary Container tint + dot indicator |
| Accessibility | Unread state conveyed by text ("Unread, ") prefix for screen readers, not dot alone |

### Profile
```
------------------------------------------------
[ Avatar ]  John Doe                              
            john.doe@email.com                   
                                                  
[ Edit Profile ]                                  
                                                  
My Hospitals                                      
[ City General Hospital           ]               
                                                  
[ Settings ]                                      
[ Support ]                                       
[ About Hospital ]                                
[ Privacy Policy ]                                 
[ Terms of Service ]                               
[ Log Out ]                                       
------------------------------------------------
```
| API | `GET /users/me` | Permission | `patients.read` (self) | Navigation | rows → respective screens; Edit Profile → inline edit form (name, DOB, gender, address, emergency contact) |

### Settings
```
------------------------------------------------
[ < ]  Settings                                   
                                                  
Notifications                                     
  Push notifications             ( ● On  )        
  Email notifications            ( ● On  )        
  Appointment reminders          ( ● On  )        
  Report ready alerts            ( ● On  )        
                                                  
Security                                          
  Change Password                    →            
  Active Sessions                    →            
                                                  
Appearance                                        
  Theme    Light | Dark | System   ▾               
                                                  
Delete Account                        →            
------------------------------------------------
```
| API | `PATCH /notifications/preferences`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /users/me/delete-request` | Interaction | Toggles save immediately (optimistic + rollback on failure) |

---

## Doctor Discovery

### Search Doctors
```
------------------------------------------------
[ < ]  ( 🔍 Search doctors, specialties )  [ ⚙ ] 
                                                  
( Cardiology ) ( Pediatrics ) ( Dermatology ) →   
                                                  
[ Dr. Sarah Patel               ] ⭐ 4.8          
[ Cardiology · City General      ]                
[ Next available: Today 4:30 PM  ]                
                                                  
[ Dr. Raj Mehta                  ]                
[ Pediatrics · Riverside Branch  ]                
[ Next available: Tomorrow       ]                
------------------------------------------------
```
| | |
|---|---|
| Navigation | Filter icon → filter bottom sheet (branch, department, availability); doctor card → Doctor Profile |
| API | `GET /doctors?query=&department=&branch=&availableToday=&page=` |
| Loading | Skeleton cards (3–5) |
| Empty | "No doctors match your search — Clear filters" |
| Error | Retry card |
| Accessibility | Filter chips announce pressed/unpressed state |

### Search Departments
```
------------------------------------------------
[ < ]  ( 🔍 Search departments )                  
                                                  
[ 🫀 Cardiology            12 doctors ]  →        
[ 🦴 Orthopedics            8 doctors ]  →        
[ 👶 Pediatrics             6 doctors ]  →        
------------------------------------------------
```
| API | `GET /departments?query=` | Navigation | row → Department Details |

### Doctor List
```
------------------------------------------------
[ < ]  Cardiology · City General                  
                                                  
[ Dr. Sarah Patel        ] ⭐ 4.8   →              
[ Dr. Amit Shah            ] ⭐ 4.6   →            
------------------------------------------------
```
| API | `GET /doctors?departmentId=` | Navigation | row → Doctor Profile |

### Doctor Profile
```
------------------------------------------------
[ < ]                                    [ ♡ ]    
                                                  
        [ Photo ]   Dr. Sarah Patel               
                     Cardiology · MD, DM          
                     ⭐ 4.8 (212 reviews)          
                                                  
City General Hospital · Main Branch               
                                                  
About                                             
15 years of experience in interventional          
cardiology...                                     
                                                  
Consultation fee: $50                              
                                                  
[ Book Appointment ]                               
------------------------------------------------
```
| | |
|---|---|
| API | `GET /doctors/:id` |
| Navigation | Book Appointment → Select Date (branch pre-selected if only one) |
| Error | `NOT_FOUND` → "This doctor is no longer available" full-screen state |
| Permission | `doctors.read` |

### Department Details
```
------------------------------------------------
[ < ]  Cardiology                                 
                                                  
About this department                             
Comprehensive heart care including...              
                                                  
Doctors                                            
[ Dr. Sarah Patel     ] ⭐ 4.8   →                 
[ Dr. Amit Shah         ] ⭐ 4.6   →               
------------------------------------------------
```
| API | `GET /departments/:id`, `GET /doctors?departmentId=` |

### Doctor Availability
```
------------------------------------------------
[ < ]  Dr. Sarah Patel · Availability             
                                                  
◀  August 2026  ▶                                 
Su Mo Tu We Th Fr Sa                              
            1  2  3  4                            
 5  6  7 [8] 9 10 11   (8 = today, has slots)     
                                                  
Selected: Fri, Aug 8                               
Morning     Afternoon     Evening                  
[9:00] [9:30]  [2:00] [2:30]  [6:00]              
[10:00]        [3:00]                             
------------------------------------------------
```
This is the merged Select Date + Select Time surface (see Appointments section below for the reused component in the booking flow itself). | API | `GET /schedules/availability` | Empty | Day with no slots shown dimmed, non-selectable; "No slots this month — Try next month" |

---

## Appointments

### Select Date
(Calendar grid — identical component to Doctor Availability above, entry point from Doctor Profile's "Book Appointment".) Header shows doctor name + branch selector chip if doctor has multiple branches.

### Select Time
```
------------------------------------------------
[ < ]  Fri, Aug 8, 2026                     [✓]  
                                                  
Morning                                           
[ 9:00 AM ] [ 9:30 AM ] [ 10:00 AM ]              
                                                  
Afternoon                                          
[ 2:00 PM ] [ 2:30 PM ]                            
                                                  
[ Continue ]                                       
------------------------------------------------
```
| API | `GET /schedules/availability?date=` | Error | Slot disappears + toast "That slot was just booked" if taken between load and tap (`APPOINTMENT_NOT_AVAILABLE`) |

### Booking Confirmation (review, pre-submit)
```
------------------------------------------------
[ < ]  Confirm Appointment                        
                                                  
Dr. Sarah Patel · Cardiology                      
City General Hospital · Main Branch                
Fri, Aug 8, 2026 · 9:00 AM                        
                                                  
Reason for visit (optional)                        
< Annual checkup >                                
                                                  
Consultation fee: $50                              
                                                  
[ Confirm Booking ]                                
------------------------------------------------
```
→ on submit, becomes success screen:
```
------------------------------------------------
              ✅                                  
        Appointment Confirmed                     
                                                  
Dr. Sarah Patel · Fri, Aug 8 · 9:00 AM             
                                                  
[ Add to Calendar ]                                
[ View Appointment ]                               
[ Done ]                                           
------------------------------------------------
```
| API | `POST /appointments` | Error | `APPOINTMENT_CONFLICT`/`APPOINTMENT_NOT_AVAILABLE` → dialog "This slot is no longer available" → back to Select Time with refreshed slots | Permission | `appointments.create` |

### Upcoming Appointments
```
------------------------------------------------
[ Appointments ]        Upcoming | History         
                                                  
[ Dr. Sarah Patel            ( Confirmed ) ]       
[ Cardiology · Fri, Aug 8 · 9:00 AM         ]      
                                                  
[ Dr. Raj Mehta                ( Scheduled ) ]     
[ Pediatrics · Mon, Aug 11 · 11:00 AM        ]     
                                                  
[ + Book Appointment ] (FAB)                       
------------------------------------------------
```
| API | `GET /appointments?status=upcoming` | Empty | "No upcoming appointments" + CTA | Navigation | segmented control → History; card → Appointment Details; FAB → Search Doctors |

### Appointment Details
```
------------------------------------------------
[ < ]  Appointment Details          ( Confirmed )  
                                                  
Dr. Sarah Patel · Cardiology                      
City General Hospital · Main Branch                
Fri, Aug 8, 2026 · 9:00 AM                          
Reason: Annual checkup                             
                                                  
[ Check In ]  (enabled 30 min before start)        
                                                  
[ Reschedule ]        [ Cancel ]                   
------------------------------------------------
```
| API | `GET /appointments/:id`, `POST /appointments/:id/checkin`, `PATCH /appointments/:id/cancel` | Interaction | Check-in button disabled with countdown label until window opens; Reschedule/Cancel disabled with explanatory caption once outside policy window |

### Reschedule
Same as Select Date/Select Time flow, header "Reschedule Appointment", pre-selects current doctor, submit calls `PATCH /appointments/:id/reschedule`.

### Cancel (modal)
```
------------------------------------------------
        Cancel this appointment?                  
                                                  
   Fri, Aug 8 · 9:00 AM with Dr. Patel             
                                                  
   Reason (optional)                               
   < ... >                                          
                                                  
   [ Keep Appointment ]   [ Yes, Cancel ]           
------------------------------------------------
```
Destructive action styling on "Yes, Cancel" (Error color).

### Check-in (modal)
```
------------------------------------------------
              You're checked in                   
                                                  
             Queue number: 12                     
        Dr. Patel is currently seeing #9           
                                                  
                [ Done ]                            
------------------------------------------------
```

### Appointment History
```
------------------------------------------------
[ Appointments ]        Upcoming | History         
                                                  
[ Dr. Sarah Patel          ( Completed ) ]         
[ Cardiology · 2 Jul 2026                ]         
                                                  
[ Dr. Amit Shah            ( Cancelled ) ]         
[ Cardiology · 18 Jun 2026               ]         
------------------------------------------------
```
| API | `GET /appointments?status=past` | Navigation | row → Appointment Details (read-only actions for completed/cancelled) |

---

## Medical

### Medical Dashboard
```
------------------------------------------------
[ Records ]                                        
                                                  
Filter: [ All Hospitals ▾ ]                        
                                                  
Active Prescriptions (2)              →            
Pending Reports (1)                    →            
                                                  
Timeline                                           
[ Aug 2  Consultation · Dr. Patel     ]            
[ Jul 28 Lab Report · Blood Test      ]             
[ Jul 2  Consultation · Dr. Shah      ]             
------------------------------------------------
```
| API | `GET /medical-records/summary` | Navigation | summary cards → filtered lists; timeline row → Consultation/Report Details |

### Medical History
```
------------------------------------------------
[ < ]  Medical History                             
                                                  
[ Date range ▾ ]  [ Hospital ▾ ]  [ Type ▾ ]      
                                                  
Aug 2026                                           
[ Aug 2 · Consultation with Dr. Patel   ]           
[        Diagnosis: Hypertension (I10)  ]           
------------------------------------------------
```
| API | `GET /medical-records?from=&to=&hospitalId=&type=` | Permission | `medical_records.read` (self) |

### Consultation Details
```
------------------------------------------------
[ < ]  Consultation · Aug 2, 2026                 
                                                  
Dr. Sarah Patel · Cardiology                       
                                                  
Vitals                                             
BP 128/82 · HR 76 · Temp 98.4°F · Wt 72kg           
                                                  
Diagnosis                                          
Hypertension (I10)                                 
                                                  
Notes                                              
Patient reports mild headaches...                  
                                                  
Prescriptions (1)                      →           
Reports Ordered (1)                    →           
------------------------------------------------
```
Internal-only clinician notes are never returned by the patient-facing API and therefore never rendered here.

### Prescription List
```
------------------------------------------------
[ < ]  Prescriptions          Active | Past        
                                                  
[ Amoxicillin 500mg          ] Dr. Patel · Aug 2  
[ Twice daily · 7 days        ]                    
------------------------------------------------
```
### Prescription Details
```
------------------------------------------------
[ < ]  Prescription                  [ ⬇ PDF ]     
                                                  
Prescribed by Dr. Sarah Patel · Aug 2, 2026        
                                                  
1. Amoxicillin 500mg                               
   Twice daily · 7 days · After food                
2. Paracetamol 650mg                                
   As needed for fever · Max 3/day                  
------------------------------------------------
```

### Lab Reports / Diagnostic Reports
```
------------------------------------------------
[ < ]  Reports              Lab | Imaging          
                                                  
[ Complete Blood Count  ( Available ) ] Aug 1      
[ Chest X-Ray            ( Pending )  ] Aug 3      
------------------------------------------------
```
### Report Details
```
------------------------------------------------
[ < ]  Complete Blood Count            [ ⬇ ]       
                                                  
Ordered by Dr. Patel · Aug 1, 2026                  
Status: Available                                  
                                                  
Hemoglobin      14.2 g/dL   (Normal)                
WBC Count       11.8 x10⁹/L (High ⚠)                
Platelets       250 x10⁹/L  (Normal)                
                                                  
🤖 AI-Assisted Summary — reviewed by Dr. Patel      
"Mildly elevated WBC, consistent with..."           
                                                  
[ View Attached File ]                              
------------------------------------------------
```
The AI-summary block only renders when `aiGenerated: true` AND `status: RELEASED`; it is always labeled and always shows the verifying clinician. | API | `GET /reports/:id`, `GET /reports/:id/file` | Permission | `reports.read` (self); un-released reports return `404`-equivalent to the patient, not a "pending" preview of AI content |

### Documents / Document Viewer
```
------------------------------------------------
[ < ]  Documents                    [ + Upload ]   
                                                  
[ 📄 Insurance Card.pdf         ] Uploaded by you  
[ 📄 Prior Scan Report.pdf      ] Uploaded by you  
------------------------------------------------
```
```
------------------------------------------------
[ < ]  Insurance Card.pdf              [ ⬇ ]       
                                                  
        [ inline PDF/image preview,               
          pinch-to-zoom enabled ]                  
------------------------------------------------
```
| API | `POST /documents`, `GET /documents`, `GET /documents/:id/download` | Error | `FILE_TOO_LARGE`, `INVALID_FILE_TYPE` shown as inline validation before upload attempt where feasible, else toast |

---

## Other

### Support
```
------------------------------------------------
[ < ]  Support                                     
                                                  
[ 📞 Call City General Hospital       ]            
[ ✉️  Email Support                     ]           
[ ❓ FAQs                               ]           
------------------------------------------------
```

### About Hospital
```
------------------------------------------------
[ < ]  City General Hospital                       
                                                  
[ Hospital photo/banner ]                          
                                                  
Address, hours, contact info                       
Departments available                              
------------------------------------------------
```

### Privacy / Terms
Static content screens, single scrollable text column, last-updated date in header, sourced from CMS-free versioned markdown bundled with the app (editable by Super Admin via Settings in a later phase — Post-MVP; MVP ships static content).
