# 33 — Environment Variables

All variables are validated at startup via a Zod schema in `packages/config`; a missing/malformed required variable fails startup immediately with a clear error, rather than surfacing as a confusing runtime failure later. `.env.example` at the repo root and per-app mirrors this table with placeholder values.

## `apps/api`

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NODE_ENV` | ✓ | `development`/`staging`/`production` | |
| `PORT` | ✓ | `4000` | Render injects its own `PORT`; the app must bind to it |
| `DATABASE_URL` | ✓ | `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` | Supabase's pgBouncer connection-pooler URL — required given Render's connection patterns; consumed by Prisma |
| `DIRECT_DATABASE_URL` | ✓ | `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres` | Supabase's direct (non-pooled) connection, required by `prisma migrate deploy` since migrations need a session-mode connection the pooler doesn't provide |
| `JWT_PRIVATE_KEY` | ✓ | PEM string | RS256 signing key, Render environment variable only, never committed |
| `JWT_PUBLIC_KEY` | ✓ | PEM string | For verification; may be distributed more widely than the private key |
| `JWT_ACCESS_TOKEN_TTL` | ✓ | `15m` | |
| `JWT_REFRESH_TOKEN_TTL_PATIENT` | ✓ | `30d` | |
| `JWT_REFRESH_TOKEN_TTL_STAFF` | ✓ | `7d` | |
| `OBJECT_STORAGE_PROVIDER` | ✓ | `local`/`supabase` | Selects the storage abstraction implementation; `local` uses MinIO in dev, `supabase` uses Supabase Storage's S3-compatible API in staging/production |
| `OBJECT_STORAGE_BUCKET` | ✓ (if `supabase`) | `hospital-platform-reports` | |
| `OBJECT_STORAGE_ENDPOINT` | ✓ (if `supabase`) | `https://[project-ref].supabase.co/storage/v1/s3` | Supabase Storage's S3-compatible endpoint |
| `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` | ✓ (if `supabase`) | | Supabase Storage S3 credentials, Render environment variable only |
| `OBJECT_STORAGE_SIGNED_URL_TTL` | ✓ | `600` (seconds) | |
| `EMAIL_PROVIDER_API_KEY` | ✓ | | Render environment variable only |
| `EMAIL_FROM_ADDRESS` | ✓ | `no-reply@hospital-platform.example` | |
| `PUSH_PROVIDER_CREDENTIALS` | ✓ | | Expo/FCM credentials, Render environment variable only |
| `SMS_PROVIDER_API_KEY` | – | | Post-MVP, unset disables the SMS channel gracefully |
| `GROQ_API_KEY` | – | | AI report-assist provider ([ADR-012](43-ARCHITECTURE-DECISIONS.md)); unset disables the `AI_ANALYZED` pipeline stage entirely, pipeline still functions (see [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) failure behavior) |
| `GROQ_MODEL` | – | `llama-3.3-70b-versatile` | Recorded in audit `REPORT_AI_ANALYZE` entries; swappable without code changes via the provider abstraction |
| `RATE_LIMIT_REDIS_URL` | ✓ (staging/"production") | `redis://...` | Distributed rate-limit counters across horizontally-scaled Render instances; local dev may use an in-memory limiter instead. A managed Redis add-on (e.g. Render's own Key Value service) is the natural choice, keeping the hosting footprint to the three platforms already in use (Vercel/Render/Supabase) rather than adding a fourth account |
| `QUEUE_BACKEND_URL` | ✓ | `redis://...` | Job queue connection, see [ADR-009](43-ARCHITECTURE-DECISIONS.md) — same Redis instance as rate limiting is sufficient at this project's scale |
| `CORS_ALLOWED_ORIGINS` | ✓ | `https://hospital-platform-admin.vercel.app` | Comma-separated allow-list, never `*` |
| `LOG_LEVEL` | ✓ | `info` | See [35-MONITORING-AND-OBSERVABILITY.md](35-MONITORING-AND-OBSERVABILITY.md) |
| `SENTRY_DSN` (or equivalent APM) | – | | Error tracking, optional but recommended in staging/"production" |
| `SUPER_ADMIN_BREAK_GLASS_ENABLED` | ✓ | `false` ("production" default) | Feature flag gating Super Admin clinical-write break-glass access, see [25-SECURITY.md](25-SECURITY.md) |

## `apps/worker`

Shares the `apps/api` environment (same `.env` in local dev; same secret set in staging/prod) since it needs the database, queue, storage, and provider credentials to process jobs.

## `apps/admin`

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | ✓ | `https://hospital-platform-api.onrender.com/api/v1` | Client-visible, not secret |
| `API_INTERNAL_BASE_URL` | – | | Not applicable on Vercel/Render (no shared private network between the two platforms) — server components call the same public Render URL as the client |
| `SESSION_COOKIE_SECRET` | ✓ | | Signs/encrypts the admin's auth cookie wrapper; secret-manager only |
| `NEXT_PUBLIC_SENTRY_DSN` | – | | Client-side error tracking |

## `apps/mobile`

| Variable | Required | Example | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | ✓ | `https://hospital-platform-api.onrender.com/api/v1` | Baked in at build time per environment (dev/preview/prod EAS profiles) |
| `EXPO_PUBLIC_SENTRY_DSN` | – | | |
| `EAS_PROJECT_ID` | ✓ (for builds) | | EAS Build configuration, not a runtime secret |

## Naming & handling conventions

- `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` prefixes mark variables safe for client-bundle inclusion — anything without that prefix must never be referenced from client-rendered code, enforced by each framework's own build-time restriction plus a code-review rule.
- No variable is ever given a working default for a secret-shaped value (API keys, signing keys, DB credentials) — those are always required-with-no-fallback, so a misconfigured deployment fails loudly at startup instead of silently running with a dev-only placeholder in production.
- Non-secret operational tunables (TTLs, limits) do have sane defaults, so local development doesn't require configuring every knob.
