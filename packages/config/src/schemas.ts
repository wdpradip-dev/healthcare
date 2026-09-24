import { z } from "zod";

/**
 * Environment schemas mirror docs/33-ENVIRONMENT-VARIABLES.md exactly.
 * That document is the source of truth — update it first if a variable changes.
 */

const booleanFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

// Every `.env.example` sets its optional URL vars to `""` rather than
// omitting them (so the file stays a complete, uncommented reference) — a
// dev who copies it verbatim would otherwise get a hard startup failure
// from `.url()` rejecting the empty string as an unset value.
const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.string().url().optional());

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),

  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_TOKEN_TTL: z.string().default("15m"),
  JWT_REFRESH_TOKEN_TTL_PATIENT: z.string().default("30d"),
  JWT_REFRESH_TOKEN_TTL_STAFF: z.string().default("7d"),

  OBJECT_STORAGE_PROVIDER: z.enum(["local", "supabase"]),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ENDPOINT: optionalUrl,
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SIGNED_URL_TTL: z.coerce.number().int().positive().default(600),
  OBJECT_STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  OBJECT_STORAGE_SIGNING_SECRET: z.string().optional(),

  EMAIL_PROVIDER_API_KEY: z.string().min(1),
  EMAIL_FROM_ADDRESS: z.string().email(),
  PUSH_PROVIDER_CREDENTIALS: z.string().min(1),
  SMS_PROVIDER_API_KEY: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  RATE_LIMIT_REDIS_URL: optionalUrl,
  QUEUE_BACKEND_URL: z.string().url(),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim())),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: optionalUrl,

  SUPER_ADMIN_BREAK_GLASS_ENABLED: booleanFromString.default("false"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const adminEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  API_INTERNAL_BASE_URL: optionalUrl,
  SESSION_COOKIE_SECRET: z.string().min(32),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

export type AdminEnv = z.infer<typeof adminEnvSchema>;

export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: z.string().url(),
  EXPO_PUBLIC_SENTRY_DSN: optionalUrl,
  EAS_PROJECT_ID: z.string().optional(),
});

export type MobileEnv = z.infer<typeof mobileEnvSchema>;
