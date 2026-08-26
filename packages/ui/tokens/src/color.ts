/**
 * Color tokens — mirrors docs/45-DESIGN-TOKENS.md exactly. That document is the
 * source of truth; update it first, then this file, if a color ever changes.
 */
export const lightColors = {
  primary: "#0F6E63",
  onPrimary: "#FFFFFF",
  primaryContainer: "#9DF2E3",
  onPrimaryContainer: "#00201B",
  secondary: "#4A6572",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#CDE7F0",
  onSecondaryContainer: "#051F27",
  tertiary: "#8A5A00",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#FFDDAF",
  onTertiaryContainer: "#2A1800",
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
  success: "#146C2E",
  onSuccess: "#FFFFFF",
  successContainer: "#B6F2C4",
  onSuccessContainer: "#00210A",
  warning: "#8A5A00",
  onWarning: "#FFFFFF",
  warningContainer: "#FFDDAF",
  background: "#FBFDFB",
  onBackground: "#191C1B",
  surface: "#FBFDFB",
  onSurface: "#191C1B",
  surfaceContainerLow: "#F3F5F2",
  surfaceContainer: "#EFF2EF",
  surfaceContainerHigh: "#E9ECE8",
  surfaceVariant: "#DBE5E1",
  onSurfaceVariant: "#404944",
  outline: "#71797A",
  outlineVariant: "#BFC9C4",
  inverseSurface: "#2E312F",
  inverseOnSurface: "#EFF1EE",
  inversePrimary: "#82D5C7",
} as const;

export const darkColors = {
  primary: "#82D5C7",
  onPrimary: "#00382F",
  primaryContainer: "#005046",
  onPrimaryContainer: "#9DF2E3",
  secondary: "#B1CBD9",
  onSecondary: "#1B333F",
  secondaryContainer: "#324B57",
  onSecondaryContainer: "#CDE7F0",
  tertiary: "#FFB95C",
  onTertiary: "#472F00",
  tertiaryContainer: "#664300",
  onTertiaryContainer: "#FFDDAF",
  error: "#F2B8B5",
  onError: "#601410",
  errorContainer: "#8C1D18",
  onErrorContainer: "#F9DEDC",
  success: "#8ADAA0",
  onSuccess: "#00390F",
  successContainer: "#005319",
  onSuccessContainer: "#B6F2C4",
  warning: "#FFB95C",
  onWarning: "#472F00",
  warningContainer: "#664300",
  background: "#191C1B",
  onBackground: "#E1E3E0",
  surface: "#191C1B",
  onSurface: "#E1E3E0",
  surfaceContainerLow: "#212422",
  surfaceContainer: "#252927",
  surfaceContainerHigh: "#2F332F",
  surfaceVariant: "#404944",
  onSurfaceVariant: "#BFC9C4",
  outline: "#8A938D",
  outlineVariant: "#404944",
  inverseSurface: "#E1E3E0",
  inverseOnSurface: "#2E312F",
  inversePrimary: "#0F6E63",
} as const;

export type ColorTokenKey = keyof typeof lightColors;

/** Matches Appointment.status in docs/13-DATABASE-DESIGN.md exactly — keep in sync. */
export const appointmentStatusColor: Record<
  | "SCHEDULED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW",
  ColorTokenKey
> = {
  SCHEDULED: "secondary",
  CONFIRMED: "primary",
  CHECKED_IN: "tertiary",
  IN_PROGRESS: "primary",
  COMPLETED: "success",
  CANCELLED: "outline",
  NO_SHOW: "error",
};
