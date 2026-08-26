# 05 — Mobile App Specification

## Scope decision

The React Native/Expo mobile app is the **Patient app only**. Doctor, Nurse, Receptionist, and Admin all work through the responsive Next.js web console ([06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md)), role-gated to show the appropriate module set. This is a deliberate scope decision — see [ADR-008](43-ARCHITECTURE-DECISIONS.md) — driven by the stated tech stack (one Expo app, one Next.js app) and MVP delivery speed; a dedicated staff mobile app is Post-MVP.

## Tech approach

- Expo (managed workflow) + Expo Router (file-based navigation) + TypeScript.
- Material Design 3 principles per [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md) / [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md).
- TanStack Query for all server state (no Redux); React Hook Form + Zod for forms/validation, sharing Zod schemas with the API via `packages/validation`.
- Navigation: stack + bottom tabs, per IA below.

## Information architecture

```
Auth Stack (unauthenticated)
  Splash → Welcome → Login / Register → OTP Verification
  Forgot Password → Reset Password

Main Tabs (authenticated)
  ├── Home
  │     Home → Notifications, Doctor Profile, Appointment Details (pushed)
  ├── Appointments
  │     Upcoming | History (segmented) → Appointment Details
  │        → Reschedule, Cancel, Check-in (pushed/modal)
  │     → Book flow: Search Doctors/Departments → Doctor Profile
  │        → Select Date → Select Time → Booking Confirmation
  ├── Records
  │     Medical Dashboard → Medical History, Prescriptions, Lab Reports,
  │     Diagnostic Reports, Documents → Report/Prescription/Document Details
  └── Profile
        Profile → Settings → Notification Preferences, Active Sessions,
        Support, About Hospital, Privacy, Terms
```

Global overlays: Notifications (accessible from Home bell icon and Profile), Document Viewer (modal, reachable from Records).

## Screen inventory (40 screens)

**Authentication (7):** Splash, Welcome, Login, Register, OTP Verification, Forgot Password, Reset Password.

**Patient Home (4):** Home, Notifications, Profile, Settings.

**Doctor Discovery (6):** Search Doctors, Search Departments, Doctor List, Doctor Profile, Department Details, Doctor Availability.

**Appointments (9):** Select Date, Select Time, Booking Confirmation, Upcoming Appointments, Appointment Details, Reschedule, Cancel (modal), Check-in (modal), Appointment History.

**Medical (10):** Medical Dashboard, Medical History, Consultation Details, Prescription List, Prescription Details, Lab Reports, Diagnostic Reports, Report Details, Documents, Document Viewer.

**Other (4 additional):** Support, About Hospital, Privacy, Terms. (Notifications is listed once above, under Patient Home, and shared as the same screen when reached from either entry point — not double-counted here.)

Full per-screen specification and wireframes: [08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md).

## Cross-cutting mobile requirements

- **Deep linking:** notification taps deep-link into the exact screen (e.g. `app://appointments/:id`), including cold-start.
- **Auth guard:** every screen under Main Tabs redirects to Auth Stack if the access token is invalid/expired and refresh fails.
- **Offline behavior:** governed by [29-OFFLINE-AND-NETWORK-BEHAVIOR.md](29-OFFLINE-AND-NETWORK-BEHAVIOR.md) — reads may serve cached TanStack Query data with a staleness indicator; sensitive writes (booking, cancel, clinical data) require live connectivity.
- **Accessibility:** per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md) — dynamic font scaling, ≥44dp touch targets, screen-reader labels on every interactive element.
- **Theming:** light/dark mode following system setting, togglable in Settings; both themes defined in [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md).
- **Platform target:** Android via EAS Build (APK for internal testing, AAB for release); iOS is code-compatible but not built/distributed in MVP.
