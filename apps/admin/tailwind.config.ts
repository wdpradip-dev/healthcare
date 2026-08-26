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
        secondary: lightColors.secondary,
        tertiary: lightColors.tertiary,
        error: lightColors.error,
        success: lightColors.success,
        warning: lightColors.warning,
        surface: lightColors.surface,
        "surface-container": lightColors.surfaceContainer,
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
