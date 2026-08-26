# 10 — Accessibility

Target: **WCAG 2.1 AA** across mobile and admin. Accessibility is a release gate for every screen, not a post-hoc pass — see [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md).

## Screen readers
- Mobile: full VoiceOver (iOS-compatible codepaths, even though iOS isn't distributed in MVP) and TalkBack support. Every interactive element has an `accessibilityLabel`/`accessibilityRole`; decorative icons are `accessibilityElementsHidden`.
- Admin: semantic HTML first (`<button>`, `<nav>`, `<table>`), ARIA only to fill gaps (custom dropdowns, bottom-sheet-equivalents). Landmark regions (`role=navigation`, `role=main`) on every page.
- Dynamic content (toasts, validation errors, notification badges) uses `aria-live="polite"`; destructive/blocking errors use `aria-live="assertive"` / `role="alert"`.
- Status chips always pair color with text or an icon (see [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)) so screen readers and colorblind users get the same information sighted users do.

## Contrast
- Body text ≥ 4.5:1 against its background; large text (≥18sp/24px or 14sp/19px bold) ≥ 3:1.
- Non-text UI (icons, focus outlines, chip borders) ≥ 3:1 against adjacent colors.
- Contrast is verified per theme (light and dark) independently — a token pair that passes in light does not get assumed to pass in dark; see [45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md) for the checked values.

## Font scaling
- Mobile respects OS-level text-size settings up to 200% without clipping or overlap (layouts use flex/relative sizing, not fixed-height text containers).
- Admin respects browser zoom up to 200% (responsive reflow, not fixed pixel layouts) and supports OS-level font-size preference where the browser exposes it.

## Touch targets
- Minimum 44x44dp (mobile) / 40x40px (admin, mouse-oriented but kept generous for tablet use at the front desk) for every tappable/clickable element, including icon-only buttons — enforced via hit-slop where the visual icon is smaller.
- Minimum 8dp/px spacing between adjacent touch targets to prevent mis-taps (e.g. chip lists, table row action icons).

## Focus states
- Every focusable element has a visible focus indicator (2dp/2px Primary-colored outline, 2dp/2px offset) that meets the 3:1 non-text contrast rule.
- Admin: full keyboard tab order follows visual/reading order; no keyboard traps (dialogs/bottom-sheets trap focus intentionally but Esc always exits and returns focus to the trigger element).
- Mobile: focus order matches screen-reader swipe order; modal sheets set initial focus to their heading on open.

## Error announcement
- Form validation errors are associated with their field via `aria-describedby` (admin) / `accessibilityHint` (mobile), not conveyed by color/position alone.
- Page-level errors (failed section load) are announced once on appearance, not repeatedly on re-render.
- Success confirmations (snackbar) are announced via live region even though they're visually transient.

## Keyboard navigation (admin)
- All CRUD flows (create, edit, delete/deactivate, confirm dialogs) are fully operable without a mouse.
- Tables support arrow-key row navigation and Enter-to-open; bulk-select supports Space-to-toggle.
- Global keyboard shortcuts (e.g. `/` to focus search) are documented in an in-app shortcut-help dialog (`?`) and never override assistive-tech shortcuts.

## Reduced motion
- Both apps respect `prefers-reduced-motion` (admin) / OS reduce-motion setting (mobile): transitions collapse to instant or a simple fade ≤100ms; parallax/scale/spring animations are disabled; skeleton-loading shimmer becomes a static placeholder.

## Forms & inputs
- Every input has a persistent visible label (not placeholder-only labeling) per MD3 floating-label pattern.
- Required fields are marked textually ("required"), not with an asterisk alone.
- Date/time pickers are operable via keyboard (admin) and expose a typed-input fallback, not calendar-grid-only interaction.

## Testing requirements
- Automated: axe-core (admin, via Playwright) and `eslint-plugin-jsx-a11y`, run as part of the local quality-gate script ([30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)); React Native accessibility linting via `eslint-plugin-react-native-a11y`.
- Manual: screen-reader pass (VoiceOver/TalkBack, NVDA/VoiceOver-web) on every new screen before it ships, tracked as part of the Definition of Done in [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md).
- Full accessibility test cases enumerated in [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md).
