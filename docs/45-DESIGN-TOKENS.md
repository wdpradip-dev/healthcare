# 45 — Design Tokens

Literal, machine-usable values for the system described narratively in [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md). This is the file `packages/ui/tokens` implements verbatim in Stage 2 (as a JSON/TS token module consumed by both the React Native theme and the Tailwind config) — treat every value here as authoritative; if a screen mockup and this file ever imply different values, this file wins.

## Color — Light theme

```json
{
  "color": {
    "light": {
      "primary": "#0F6E63",
      "onPrimary": "#FFFFFF",
      "primaryContainer": "#9DF2E3",
      "onPrimaryContainer": "#00201B",
      "secondary": "#4A6572",
      "onSecondary": "#FFFFFF",
      "secondaryContainer": "#CDE7F0",
      "onSecondaryContainer": "#051F27",
      "tertiary": "#8A5A00",
      "onTertiary": "#FFFFFF",
      "tertiaryContainer": "#FFDDAF",
      "onTertiaryContainer": "#2A1800",
      "error": "#B3261E",
      "onError": "#FFFFFF",
      "errorContainer": "#F9DEDC",
      "onErrorContainer": "#410E0B",
      "success": "#146C2E",
      "onSuccess": "#FFFFFF",
      "successContainer": "#B6F2C4",
      "onSuccessContainer": "#00210A",
      "warning": "#8A5A00",
      "onWarning": "#FFFFFF",
      "warningContainer": "#FFDDAF",
      "background": "#FBFDFB",
      "onBackground": "#191C1B",
      "surface": "#FBFDFB",
      "onSurface": "#191C1B",
      "surfaceContainerLow": "#F3F5F2",
      "surfaceContainer": "#EFF2EF",
      "surfaceContainerHigh": "#E9ECE8",
      "surfaceVariant": "#DBE5E1",
      "onSurfaceVariant": "#404944",
      "outline": "#71797A",
      "outlineVariant": "#BFC9C4",
      "inverseSurface": "#2E312F",
      "inverseOnSurface": "#EFF1EE",
      "inversePrimary": "#82D5C7"
    }
  }
}
```

## Color — Dark theme

```json
{
  "color": {
    "dark": {
      "primary": "#82D5C7",
      "onPrimary": "#00382F",
      "primaryContainer": "#005046",
      "onPrimaryContainer": "#9DF2E3",
      "secondary": "#B1CBD9",
      "onSecondary": "#1B333F",
      "secondaryContainer": "#324B57",
      "onSecondaryContainer": "#CDE7F0",
      "tertiary": "#FFB95C",
      "onTertiary": "#472F00",
      "tertiaryContainer": "#664300",
      "onTertiaryContainer": "#FFDDAF",
      "error": "#F2B8B5",
      "onError": "#601410",
      "errorContainer": "#8C1D18",
      "onErrorContainer": "#F9DEDC",
      "success": "#8ADAA0",
      "onSuccess": "#00390F",
      "successContainer": "#005319",
      "onSuccessContainer": "#B6F2C4",
      "warning": "#FFB95C",
      "onWarning": "#472F00",
      "warningContainer": "#664300",
      "background": "#191C1B",
      "onBackground": "#E1E3E0",
      "surface": "#191C1B",
      "onSurface": "#E1E3E0",
      "surfaceContainerLow": "#212422",
      "surfaceContainer": "#252927",
      "surfaceContainerHigh": "#2F332F",
      "surfaceVariant": "#404944",
      "onSurfaceVariant": "#BFC9C4",
      "outline": "#8A938D",
      "outlineVariant": "#404944",
      "inverseSurface": "#E1E3E0",
      "inverseOnSurface": "#2E312F",
      "inversePrimary": "#0F6E63"
    }
  }
}
```

Contrast check (per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md)): all `on*` colors verified ≥4.5:1 against their paired surface at authoring time; re-verify with an automated contrast checker in CI once `packages/ui` exists ([44-CODING-STANDARDS.md](44-CODING-STANDARDS.md)).

## Typography scale

```json
{
  "typography": {
    "fontFamily": { "base": "Inter, -apple-system, Roboto, sans-serif" },
    "mobile": {
      "display":      { "size": 32, "lineHeight": 40, "weight": 700 },
      "headline":     { "size": 24, "lineHeight": 32, "weight": 700 },
      "titleLarge":   { "size": 20, "lineHeight": 28, "weight": 600 },
      "titleMedium":  { "size": 16, "lineHeight": 24, "weight": 600 },
      "bodyLarge":    { "size": 16, "lineHeight": 24, "weight": 400 },
      "bodyMedium":   { "size": 14, "lineHeight": 20, "weight": 400 },
      "label":        { "size": 12, "lineHeight": 16, "weight": 600, "letterSpacing": 0.5, "uppercase": true }
    },
    "admin": {
      "display":      { "size": 28, "lineHeight": 36, "weight": 700 },
      "headline":     { "size": 22, "lineHeight": 30, "weight": 600 },
      "titleLarge":   { "size": 18, "lineHeight": 26, "weight": 600 },
      "titleMedium":  { "size": 15, "lineHeight": 22, "weight": 600 },
      "bodyLarge":    { "size": 14, "lineHeight": 20, "weight": 400 },
      "bodyMedium":   { "size": 13, "lineHeight": 18, "weight": 400 },
      "label":        { "size": 12, "lineHeight": 16, "weight": 600 }
    }
  }
}
```

## Spacing

```json
{ "spacing": { "0": 0, "1": 4, "2": 8, "3": 12, "4": 16, "6": 24, "8": 32, "12": 48, "16": 64 } }
```
Screen padding: mobile `16`, admin content area `24`. Card padding: mobile `16`, admin `20`.

## Corner radius

```json
{ "radius": { "xs": 4, "sm": 8, "md": 16, "lg": 28, "full": 9999 } }
```
`xs` chips/badges · `sm` text fields/buttons/table rows · `md` cards · `lg` bottom sheets/full-screen dialogs top corners · `full` avatars/FAB.

## Elevation (mobile — MD3 tonal elevation overlay opacity on Primary at each level)

```json
{ "elevation": { "0": 0, "1": 0.05, "2": 0.08, "3": 0.11, "4": 0.12, "5": 0.14 } }
```

## Shadow (admin — physical box-shadow)

```json
{
  "shadow": {
    "card": "0 1px 2px rgba(0,0,0,0.06)",
    "cardHover": "0 2px 6px rgba(0,0,0,0.08)",
    "modal": "0 8px 24px rgba(0,0,0,0.12)"
  }
}
```

## Motion

```json
{
  "motion": {
    "duration": { "mobile": 250, "admin": 150, "reducedMotion": 0 },
    "easing": { "standard": "cubic-bezier(0.2, 0.0, 0, 1.0)" }
  }
}
```

## Icon sizing

```json
{ "icon": { "mobile": 24, "admin": 20 } }
```

## Component-level tokens (selected)

```json
{
  "component": {
    "button": { "heightMobile": 48, "heightAdmin": 40, "radius": 8 },
    "textField": { "heightMobile": 56, "heightAdmin": 40, "radius": 8, "borderWidth": 1, "borderWidthFocus": 2 },
    "searchField": { "radius": 28 },
    "chip": { "radius": 4, "heightMobile": 32, "heightAdmin": 28 },
    "avatar": { "sizeSmall": 32, "sizeMedium": 48, "sizeLarge": 96 },
    "touchTarget": { "minMobile": 44, "minAdmin": 40 }
  }
}
```

## Status color mapping (chips)

```json
{
  "status": {
    "SCHEDULED": "secondary",
    "CONFIRMED": "primary",
    "CHECKED_IN": "tertiary",
    "IN_PROGRESS": "primary",
    "COMPLETED": "success",
    "CANCELLED": "outline",
    "NO_SHOW": "error"
  }
}
```
Matches the `Appointment.status` enum in [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md) exactly — a new status value added to the schema must get an entry here before shipping, enforced by code review, not by an automated check (the mapping lives in `packages/ui`, the enum in `packages/database`, deliberately in different packages).
