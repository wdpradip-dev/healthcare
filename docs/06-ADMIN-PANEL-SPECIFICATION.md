# 06 — Admin Panel Specification

## Scope

The Next.js web console serves **four** authenticated audiences behind one codebase, one login, and role-gated navigation:

- **Doctor** — schedule, consultation workspace, clinical documentation (see [ADR-008](43-ARCHITECTURE-DECISIONS.md) for why this lives here rather than in the mobile app).
- **Nurse** — intake, vitals, check-in, queue.
- **Receptionist** — registration, booking, check-in, queue.
- **Admin / Super Admin** — full operational console.

The module set rendered is derived from the logged-in user's permissions, not a hardcoded per-role UI branch — the same navigation-building logic reads the permission catalog so new permission combinations (e.g. a custom role) automatically surface the right modules.

## Tech approach

- Next.js App Router + TypeScript, server components for data-heavy list/detail pages, client components for interactive forms/tables.
- Tailwind CSS with an MD3-inspired token set distinct from, but harmonized with, the mobile design system ([07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)).
- TanStack Query for client-side data fetching/mutations; React Hook Form + Zod (shared schemas via `packages/validation`).
- Charts: a lightweight charting library consistent with the design system's data-viz guidance (Recharts, MD3-token-themed).

## Information architecture

```
Auth (unauthenticated)
  Login → Forgot Password → Reset Password
  Activate Account (from staff invitation link)

Console (authenticated, sidebar + topbar shell)
  Dashboard
  Patients            → Patient Details → Medical History (read-only)
  Doctors             → Doctor Details
  Staff               → Staff Details
  Departments
  Branches
  Appointments        → Appointment Details
  Calendar
  Doctor Schedules     → Schedule Exceptions
  Consultations (Doctor/Nurse entry point) → Consultation Workspace
  Reports             → Report Details
  Documents
  Notifications
  Users               → Roles → Permissions (Super Admin edits catalog)
  Audit Logs
  Analytics
  Settings
```

Sidebar module visibility per role:

| Module | Doctor | Nurse | Receptionist | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard | limited | – | – | ✓ | ✓ (+hospital switcher) |
| Patients | assigned | branch | branch | ✓ | ✓ |
| Doctors | – | – | read | ✓ | ✓ |
| Staff | – | – | – | ✓ | ✓ |
| Departments/Branches | – | – | read | ✓ | ✓ (+create hospital) |
| Appointments/Calendar | own | branch | branch | ✓ | ✓ |
| Doctor Schedules | own | – | read | ✓ | ✓ |
| Consultations | ✓ | intake only | – | – | – |
| Reports/Documents | ✓ | read | – | oversight | oversight |
| Notifications | own | own | own | ✓ | ✓ |
| Users/Roles/Permissions | – | – | – | users/roles | ✓ full catalog |
| Audit Logs | – | – | – | ✓ | ✓ |
| Analytics | – | – | – | ✓ | ✓ (aggregate) |
| Settings | – | – | – | ✓ | ✓ (+platform settings) |

## Screen inventory (25 screens)

Dashboard, Patients, Patient Details, Doctors, Doctor Details, Staff, Staff Details, Departments, Branches, Appointments, Appointment Details, Calendar, Doctor Schedules, Schedule Exceptions, Consultation Workspace, Reports, Report Details, Documents, Notifications, Users, Roles, Permissions, Audit Logs, Analytics, Settings.

Full per-screen specification: [09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md).

## Cross-cutting admin requirements

- **Tenant scoping in the UI:** Admin's session is pinned to one Hospital; Super Admin gets an explicit hospital-switcher control in the topbar, and every screen visibly labels which hospital's data is shown (never ambiguous).
- **Tables:** server-side pagination, sortable columns, saved filter presets, CSV export where permission allows (`*.read` implies export unless explicitly restricted — see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md) for export controls on clinical data).
- **Forms:** optimistic UI only for low-risk actions (e.g. marking a notification read); clinical/appointment mutations wait for server confirmation before navigating away.
- **Audit-visible actions:** any destructive/override action (force-cancel, deactivate, permission change) requires an inline confirmation dialog stating what will be logged.
- **Accessibility:** full keyboard navigation, visible focus states, WCAG AA contrast — see [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md).
- **Responsive range:** designed for desktop/laptop first (≥1280px), degrades gracefully to tablet (≥768px) for front-desk/ward tablet use; not optimized below 768px.
