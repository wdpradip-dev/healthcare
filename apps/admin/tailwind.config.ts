import type { Config } from "tailwindcss";
import { lightColors } from "@hospital/ui-tokens";

/**
 * Tailwind theme is generated from @hospital/ui-tokens (docs/45-DESIGN-TOKENS.md)
 * so a design-system change propagates here automatically rather than being
 * hand-duplicated. Dark-theme token wiring (via a `dark:` variant strategy) is
 * added alongside the admin shell in Phase 4 (docs/40-ROADMAP.md).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: lightColors.primary,
        "on-primary": lightColors.onPrimary,
        "primary-container": lightColors.primaryContainer,
        "on-primary-container": lightColors.onPrimaryContainer,
        secondary: lightColors.secondary,
        "on-secondary": lightColors.onSecondary,
        "secondary-container": lightColors.secondaryContainer,
        "on-secondary-container": lightColors.onSecondaryContainer,
        tertiary: lightColors.tertiary,
        "on-tertiary": lightColors.onTertiary,
        "tertiary-container": lightColors.tertiaryContainer,
        "on-tertiary-container": lightColors.onTertiaryContainer,
        error: lightColors.error,
        "on-error": lightColors.onError,
        "error-container": lightColors.errorContainer,
        "on-error-container": lightColors.onErrorContainer,
        success: lightColors.success,
        "on-success": lightColors.onSuccess,
        "success-container": lightColors.successContainer,
        "on-success-container": lightColors.onSuccessContainer,
        warning: lightColors.warning,
        "on-warning": lightColors.onWarning,
        "warning-container": lightColors.warningContainer,
        surface: lightColors.surface,
        "surface-container": lightColors.surfaceContainer,
        "surface-variant": lightColors.surfaceVariant,
        "on-surface": lightColors.onSurface,
        "on-surface-variant": lightColors.onSurfaceVariant,
        outline: lightColors.outline,
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "Roboto", "sans-serif"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "28px",
      },
    },
  },
  plugins: [],
};

export default config;
