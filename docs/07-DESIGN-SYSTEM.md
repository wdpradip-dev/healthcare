# 07 — Design System

Literal token values (hex/dp/sp) live in [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md); this document is the narrative rationale and component behavior spec. Mobile and Admin share the same brand and token *source* but expose it through two densities — see "Two surfaces, one brand" below.

## Brand concept

**"Calm competence."** The product should feel like a well-run hospital's best day, not a hospital at all — closer to a premium banking or travel app than to clinical software. Patients are often anxious when they open this app; the UI must never add noise, ambiguity, or visual urgency where none exists (e.g. never use red for neutral information). Trust is built through restraint, generous spacing, and predictable patterns, not through decoration.

## Color system (light theme baseline)

MD3 role-based color system. Full ramps (0–100 tonal steps) are in [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md); key roles:

| Role | Value | Usage |
|---|---|---|
| Primary | Deep clinical teal `#0F6E63` | Primary actions, active nav, key brand moments |
| On Primary | `#FFFFFF` | Text/icons on Primary |
| Primary Container | `#9DF2E3` | Filled chips, selected states, highlighted cards |
| Secondary | Slate blue `#4A6572` | Secondary actions, supporting UI (segmented controls, secondary buttons) |
| Tertiary | Warm amber `#8A5A00` | Sparingly — reminders, non-urgent highlights (e.g. "today" marker), never for errors |
| Error | `#B3261E` | Errors, destructive actions only — never repurposed for warnings |
| Warning (extension role) | `#8A5A00` (shares Tertiary) | Non-blocking cautions (e.g. "outside policy window") |
| Success (extension role) | `#146C2E` | Confirmations, completed states |
| Surface | `#FBFDFB` | Screen background |
| Surface Container | `#EFF2EF` | Cards, sheets |
| Surface Container High | `#E9ECE8` | Elevated cards, modals |
| Outline | `#71797A` | Borders, dividers |
| On Surface | `#191C1B` | Primary text |
| On Surface Variant | `#404944` | Secondary text |

**Dark theme** inverts surface/on-surface per MD3 rules while keeping Primary/Error/Success hues perceptually consistent (adjusted lightness for contrast) — full values in [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md).

**Rules:** No gradients except a single, subtle 2-stop gradient reserved for the auth splash background. Never use more than one accent color (Tertiary) per screen. Status color (Error/Warning/Success) is reserved exclusively for status communication — never decorative.

## Typography

Font family: **Inter** (system fallback: Roboto/SF Pro) for both mobile and admin — one typeface, two type scales (mobile MD3 scale is larger/touch-oriented; admin scale is denser for information density).

| Style | Mobile size/weight | Admin size/weight | Usage |
|---|---|---|---|
| Display | 32/700 | 28/700 | Rare — onboarding only |
| Headline | 24/700 | 22/600 | Screen titles |
| Title Large | 20/600 | 18/600 | Section headers, card titles |
| Title Medium | 16/600 | 15/600 | List item titles, form section labels |
| Body Large | 16/400 | 14/400 | Primary body text |
| Body Medium | 14/400 | 13/400 | Secondary text, table cells |
| Label | 12/600, uppercase tracking 0.5px | 12/600 | Chips, status badges, table headers |

## Spacing scale

4dp base unit: `4, 8, 12, 16, 24, 32, 48, 64`. Screen horizontal padding: 16dp (mobile), 24dp (admin content area). Card internal padding: 16dp (mobile), 20dp (admin).

## Corner radius

`4dp` (chips, small badges) · `8dp` (text fields, buttons, table rows) · `16dp` (cards) · `28dp` (bottom sheets top corners, full-screen dialogs) · `50%` (avatars, FAB).

## Elevation & shadow

MD3 5-level elevation via tonal overlay (not pure box-shadow) on mobile: Level 0 (surface) → Level 3 (dialogs/bottom sheets). Admin uses a lighter physical-shadow system (`0 1px 2px rgba(0,0,0,.06)` cards, `0 8px 24px rgba(0,0,0,.12)` modals/menus) appropriate to desktop density.

## Iconography

Material Symbols (Rounded), 24dp default mobile / 20dp default admin, stroke-consistent, filled variant only for active/selected navigation states.

## Component specifications

### Buttons
- **Filled** (Primary): main CTA, one per screen/section max. Height 48dp mobile / 40dp admin.
- **Tonal** (Primary Container bg): secondary emphasis actions (e.g. "View Appointment").
- **Outlined**: tertiary actions (e.g. "Cancel" in a dialog's secondary slot).
- **Text**: lowest emphasis (e.g. "Skip", table row actions).
- **Destructive**: Error color, Filled or Text variant only, always paired with a confirmation dialog.
- States: default, hover (admin only), pressed (8% state-layer), disabled (38% opacity content, no state-layer), loading (spinner replaces label, width preserved).

### Cards
Surface Container background, 16dp radius, no border by default (1dp Outline-variant border only when adjacent cards need separation without shadow, e.g. dense admin tables-as-cards on tablet). Elevation 1 default, Elevation 2 on hover/press if interactive.

### Text fields
Outlined MD3 style: floating label, 8dp radius, 1dp Outline border → 2dp Primary border on focus, Error border + helper text on invalid, leading/trailing icon slots. Admin uses a denser 40dp height vs mobile's 56dp.

### Search fields
Pill-shaped (28dp radius) with leading search icon and optional trailing filter icon; mobile search fields sit in a sticky header; admin search fields pair with a filter drawer trigger.

### Dropdowns / Selects
Mobile: opens a bottom sheet list (not a native picker, for visual consistency) except native date/time pickers (see below). Admin: standard MD3 menu anchored to the field, keyboard-navigable.

### Chips
Assist chips (actions), Filter chips (multi-select, toggled Primary Container fill when active), Status chips (non-interactive, color-coded: Scheduled=Secondary, Confirmed=Primary, Checked-In=Tertiary, In Progress=Primary, Completed=Success, Cancelled=Outline/neutral, No-Show=Error).

### Tabs
Mobile: bottom tab bar (5 max, icon+label, active = filled icon + Primary label) and top segmented tabs for in-screen toggles (e.g. Upcoming/History). Admin: horizontal top tabs within a page (e.g. Patient Details sub-tabs) using an underline indicator.

### Navigation
Mobile: bottom tab bar (persistent) + stack push for detail screens, modal presentation for confirmations (cancel, check-in). Admin: persistent left sidebar (collapsible to icon-only), topbar with breadcrumbs + user menu + notification bell.

### Bottom sheets (mobile only)
Used for: filters, dropdown selection, quick actions (e.g. long-press on appointment card), share/export options. 28dp top-corner radius, drag handle, backdrop scrim 32% opacity.

### Dialogs
Centered, 28dp radius (mobile) / 12dp radius (admin), max-width 560px on admin. Always: title, body, max 2 actions (primary right, secondary left/text). Destructive actions use Error-colored primary button and restate the consequence in the body text.

### Snackbars / Toasts
Bottom-anchored (mobile) / bottom-right (admin), 4s auto-dismiss default (8s if it includes an "Undo" action), single-line + optional single action, never stacked more than 1 at a time (queue subsequent ones).

### Date pickers / Time pickers / Calendar
Mobile: MD3 calendar-grid date picker (modal), custom time-slot grid (not a wheel picker — slots come from real availability, not arbitrary times) for appointment booking specifically; a generic wheel/spinner time picker is used only for non-appointment inputs (rare). Admin: inline calendar-grid date range picker in a popover; the Calendar screen itself is a full week/day grid view (like a shared calendar app) for appointments.

### Lists
Single-line (label only), two-line (label + supporting text), three-line + leading avatar/icon + optional trailing metadata/chip — the standard pattern for appointment/patient/doctor rows across both apps.

### Tables (admin only)
Zebra-free (rely on row divider + hover highlight, not banding, per "calm" brand principle), sticky header, sortable columns (click header), row-level overflow menu, bulk-select checkbox column when bulk actions exist, empty/loading/error states inline within the table body (not full-page swaps).

### Empty / Loading / Error / Success states
- **Empty:** icon (outlined, Outline color) + one-line explanation + primary action when applicable (e.g. "No appointments yet — Book your first appointment").
- **Loading:** skeleton screens matching final layout (never a centered spinner for list/detail screens; spinners reserved for button-level and full-screen initial auth checks).
- **Error:** inline for field-level; a retry-capable error card for section/page-level ("Something went wrong loading your appointments — Retry"), never a raw stack trace or backend error string.
- **Success:** snackbar for transient confirmations; a dedicated success screen only for irreversible/significant actions (booking confirmation).

### Accessibility states
Every interactive component has a visible focus indicator (2dp Primary outline, offset 2dp) in addition to platform-default focus rings on admin; color is never the only differentiator (status chips carry an icon or label, not color alone). Full requirements in [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md).

## Two surfaces, one brand

| | Mobile (Patient) | Admin (Staff/Ops) |
|---|---|---|
| Density | Comfortable, touch-first | Compact, information-dense |
| Primary interaction | Tap, swipe, bottom sheets | Click, keyboard, hover, right-click-free |
| Color intensity | Softer tonal fills, more whitespace | Slightly higher-contrast borders/dividers for scanability |
| Motion | Standard MD3 easing/duration | Snappier (150ms vs 250ms) to suit desktop expectations |

Both consume the same token source ([45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md)) via `packages/ui`, so a brand update (e.g. Primary color) changes once and propagates to both apps.
