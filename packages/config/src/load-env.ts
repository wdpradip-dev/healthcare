import type { z } from "zod";

/**
 * Validates `source` (defaults to `process.env`) against `schema`.
 * Fails fast with every missing/malformed variable listed, rather than surfacing
 * a confusing runtime failure the first time an unset variable is actually used.
 * See docs/33-ENVIRONMENT-VARIABLES.md.
 */
export function loadEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${issues}`,
    );
  }

  return result.data;
}
