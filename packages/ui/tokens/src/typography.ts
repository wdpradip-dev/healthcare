/** Typography scale — mirrors docs/45-DESIGN-TOKENS.md. */
export const fontFamily = {
  base: "Inter, -apple-system, Roboto, sans-serif",
} as const;

interface TypeStyle {
  size: number;
  lineHeight: number;
  weight: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

export const mobileTypography: Record<
  "display" | "headline" | "titleLarge" | "titleMedium" | "bodyLarge" | "bodyMedium" | "label",
  TypeStyle
> = {
  display: { size: 32, lineHeight: 40, weight: 700 },
  headline: { size: 24, lineHeight: 32, weight: 700 },
  titleLarge: { size: 20, lineHeight: 28, weight: 600 },
  titleMedium: { size: 16, lineHeight: 24, weight: 600 },
  bodyLarge: { size: 16, lineHeight: 24, weight: 400 },
  bodyMedium: { size: 14, lineHeight: 20, weight: 400 },
  label: { size: 12, lineHeight: 16, weight: 600, letterSpacing: 0.5, uppercase: true },
};

export const adminTypography: Record<
  "display" | "headline" | "titleLarge" | "titleMedium" | "bodyLarge" | "bodyMedium" | "label",
  TypeStyle
> = {
  display: { size: 28, lineHeight: 36, weight: 700 },
  headline: { size: 22, lineHeight: 30, weight: 600 },
  titleLarge: { size: 18, lineHeight: 26, weight: 600 },
  titleMedium: { size: 15, lineHeight: 22, weight: 600 },
  bodyLarge: { size: 14, lineHeight: 20, weight: 400 },
  bodyMedium: { size: 13, lineHeight: 18, weight: 400 },
  label: { size: 12, lineHeight: 16, weight: 600 },
};
