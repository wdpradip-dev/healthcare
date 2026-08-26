/** Spacing, radius, elevation, motion, icon, and component tokens — mirrors docs/45-DESIGN-TOKENS.md. */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 28,
  full: 9999,
} as const;

/** Mobile MD3 tonal-elevation overlay opacity at each level. */
export const elevation = {
  0: 0,
  1: 0.05,
  2: 0.08,
  3: 0.11,
  4: 0.12,
  5: 0.14,
} as const;

/** Admin physical box-shadow values. */
export const shadow = {
  card: "0 1px 2px rgba(0,0,0,0.06)",
  cardHover: "0 2px 6px rgba(0,0,0,0.08)",
  modal: "0 8px 24px rgba(0,0,0,0.12)",
} as const;

export const motion = {
  duration: { mobile: 250, admin: 150, reducedMotion: 0 },
  easing: { standard: "cubic-bezier(0.2, 0.0, 0, 1.0)" },
} as const;

export const icon = {
  mobile: 24,
  admin: 20,
} as const;

export const component = {
  button: { heightMobile: 48, heightAdmin: 40, radius: 8 },
  textField: { heightMobile: 56, heightAdmin: 40, radius: 8, borderWidth: 1, borderWidthFocus: 2 },
  searchField: { radius: 28 },
  chip: { radius: 4, heightMobile: 32, heightAdmin: 28 },
  avatar: { sizeSmall: 32, sizeMedium: 48, sizeLarge: 96 },
  touchTarget: { minMobile: 44, minAdmin: 40 },
} as const;
