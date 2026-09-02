# 42 — Project State

**Last updated:** 2026-09-02 · **Updated by:** Phase 3 implementation

This file is the single current-moment snapshot of where the project actually is. It is updated after every meaningful implementation milestone (per the PLAN → ... → UPDATE PROJECT STATE cycle in [40-ROADMAP.md](40-ROADMAP.md)) — if this file and a phase's task statuses in [41-TASKS.md](41-TASKS.md) ever disagree, treat that as a bug to fix immediately, not a stale-doc shrug.

## Current phase

**Phase 3 — Authentication / RBAC: COMPLETE.** All tasks `T-301`–`T-311` done (see [41-TASKS.md](41-TASKS.md)). Next: **Phase 4 — Hospital/branch/department/user management** (`T-401` onward).

## Decision update: GitHub added for source control (2026-08-25)

Partway through Phase 2, the user reversed half of the original "no GitHub" decision ([ADR-011](43-ARCHITECTURE-DECISIONS.md), originally recorded during Stage 1 → Stage 2 transition): they created `github.com/wdpradip-dev/healthcare`, set a repo-local git identity (not global), and added it as the `origin` remote. GitHub is now used for source-control backup/history only — **the "no hosted CI/CD" half of the decision is unchanged**, no GitHub Actions workflow exists or is planned, and deploys remain the manual CLI-driven workflow in [32-DEPLOYMENT.md](32-DEPLOYMENT.md). ADR-011, `CLAUDE.md`, and the deployment docs were updated in the same change to stop claiming "no GitHub" outright.

## Completed features

**Phase 1 / Phase 2** — see prior entries in git history for detail: monorepo scaffold, full Prisma schema + initial migration, catalog/demo seed scripts, `SUPER_ADMIN` bootstrap script, soft-delete Prisma extension.

**Phase 3 — Backend (`apps/api`):**
- NestJS bootstrap: global guard chain (`RateLimitGuard` → `JwtAuthGuard` → `AuthorizationGuard`, registered via `APP_GUARD`) + `GlobalExceptionFilter` (`APP_FILTER`), all in `CommonModule`. Every controller method carries exactly one of `@Public()` / `@Authenticated()` / `@RequirePermission()`, enforced by a custom TypeScript-AST static checker (`scripts/check-route-permissions.mjs`) wired into `apps/api`'s `lint` script — not just a convention, a build-breaking check.
- `AuthModule`: register (OTP-gated activation) → verify-otp → login (lockout after 5 failed attempts, 15 min) → refresh (rotating opaque tokens, reuse-detection revokes the whole session family) → logout → forgot-password → reset-password (revokes all sessions) → sessions list/revoke → `me`. OTP: 6-digit, argon2-hashed, 5 min TTL, 5 max attempts, 30 s resend cooldown, 5/hour cap. No-enumeration on login and forgot-password (verified by test, not just by inspection).
- JWT RS256 access tokens (15 min) + SHA-256-hashed opaque refresh tokens (`packages/shared/src/auth/token-hash.ts`).
- `AuditInterceptor`/`AuditService` scaffold — `AuditLog` rows written on register/login/logout/password-reset today; wired for every future mutating route.
- `packages/validation/src/auth.ts` — the Zod schemas for every `/auth` DTO, shared verbatim between the API's `ZodValidationPipe` and both clients' `react-hook-form` resolvers (one schema, never duplicated). Fixed a real bug in this pass: `verifyOtpSchema`/`resetPasswordSchema`'s `code` field used `.length(6).regex(...)` — a code with the wrong length fell through to Zod's generic `"String must contain exactly 6 character(s)"` instead of the intended `"Code must be 6 digits."`, since `.length()` fires before `.regex()` and had no custom message. Fixed by giving `.length()` the same message.
- Verified via 16/16 passing integration tests (`apps/api/test/auth.integration-spec.ts`, Jest + Supertest against a full booted Nest app) covering register, verify-otp, login (incl. lockout), refresh (incl. reuse-detection), forgot/reset password (incl. no-enumeration), and `me` — plus ~17 unit tests across guards/pipes/JWT service/health controller.

**Phase 3 — Admin (`apps/admin`):** Login, Forgot Password, Reset Password pages (`src/app/{login,forgot-password,reset-password}`), all React Hook Form + `zodResolver` against the shared schemas, calling the API through Server Actions (`actions.ts` in each route folder) that never expose the refresh token to client JS.
- Session model matches docs/16-AUTHENTICATION.md exactly: refresh token lives in an **httpOnly, Secure (prod), SameSite=Strict cookie**, and — per `docs/33-ENVIRONMENT-VARIABLES.md`'s `SESSION_COOKIE_SECRET` ("signs/encrypts the admin's auth cookie wrapper") — the cookie value is sealed with `iron-session`'s `sealData`/`unsealData` (AES-GCM + signing), not stored as the raw token. The access token is never persisted client-side at all (no cookie, no `localStorage`); it lives only in a React Context (`src/lib/auth-provider.tsx`) re-derived on every app load by exchanging the sealed cookie via `POST /api/session/refresh`.
- New shared component primitives in `packages/ui/web` (`Button`, `TextField`, `FormAlert`, `AuthShell`) — the package was an empty Phase 1 placeholder before this.
- Verified two ways: 11 passing component tests (render / validation-error / API-error / success paths per all three screens, per docs/30-TESTING-STRATEGY.md's "Mobile & Admin coverage" minimum), **and** a real browser session against a running `next dev` server (client-side Zod validation, graceful API-unreachable error banner, forgot→reset navigation carrying the masked-destination/challenge-id query params, malformed-code/weak-password validation) — see "Known issues" for what that browser check could *not* cover.

**Phase 3 — Mobile (`apps/mobile`):** Splash, Welcome, Login, Register, OTP Verification, Forgot Password, Reset Password screens (`app/{index,welcome,login,register,otp-verify,forgot-password,reset-password}.tsx`), matching docs/08-MOBILE-DESIGN-MOCKUPS.md's "Authentication" wireframes screen-for-screen (including the two-step reset flow: OTP Verification confirms the code, Reset Password only asks for the new password — no code re-entry).
- Session model per docs/16: refresh token in Expo SecureStore (`src/lib/secure-storage.ts`); access token in memory only (`src/lib/auth-context.tsx`), re-derived on cold start via the same `/auth/refresh` → `/auth/me` sequence as admin.
- New shared component primitives in `packages/ui/native` (`Button`, `TextField`, `FormAlert`, `AuthScreen`, `OtpInput`) — also an empty Phase 1 placeholder before this.
- Scope decision: Login's "→ OTP Verification if unverified" branch (docs/08) is **not** implemented — resuming a lost `REGISTRATION` OTP challenge from just an identifier has no backing endpoint yet (only `forgot-password` can (re)issue a challenge, and only for `PASSWORD_RESET`). `AUTH_ACCOUNT_PENDING_ACTIVATION` is shown as a plain error message instead. A "resend registration OTP" endpoint is a small, clearly-scoped follow-up whenever this gap needs closing — not invented speculatively here per `CLAUDE.md`'s "don't invent new API routes without updating docs first."
- Verified via 18 passing component tests (React Native Testing Library) across all 6 screens. **A real bug was caught by this suite**: `OtpInput`'s auto-submit-on-6th-digit never fired, because its completion check was `!next.includes("")` on the *joined string* — every string trivially "includes" `""` in JavaScript, so that condition was always `false`. Fixed to rely on the already-sufficient `next.length === LENGTH` check. Not caught by typecheck/lint since it's a logic bug, not a type error — exactly the kind of thing this coverage requirement exists to catch.
- **Not verified in a simulator, Expo Go, or `expo start --web`** — see "Known issues".

**Four pre-existing infrastructure gaps, discovered (not introduced) while doing the above, and fixed in this pass:**
1. `apps/api/src/main.ts` never loaded `.env` for local dev (`pnpm --filter api dev`) — no `dotenv` import anywhere, so a real developer following `CLAUDE.md`'s documented `pnpm --filter api dev` command would hit "Invalid environment configuration" immediately on a fresh checkout. Fixed with a guarded `import "dotenv/config"` at the top of `main.ts` (no-ops if `.env` doesn't exist; never touches the test suite, which never imports `main.ts`).
2. `packages/config/src/schemas.ts`'s optional URL env vars (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `OBJECT_STORAGE_ENDPOINT`, `RATE_LIMIT_REDIS_URL`, `API_INTERNAL_BASE_URL`) used `z.string().url().optional()` — but every `.env.example` sets these to `""` rather than omitting them, and `.optional()` doesn't help against an empty string. Copying `.env.example` to `.env` verbatim (the documented setup step) would hard-crash on startup. Fixed with a shared `optionalUrl` helper that treats `""` as unset before validating.
3. `apps/mobile/jest.config.js`'s `transformIgnorePatterns` — copied from Expo's standard template, which assumes a flat `node_modules/react-native/...` layout — never matched pnpm's nested `node_modules/.pnpm/<name>/node_modules/<name>/...` layout, so **no mobile test had ever successfully run** in this repo (`passWithNoTests: true` masked it since zero test files existed before this phase). Fixed with an optional `(\.pnpm/[^/]+/node_modules/)?` prefix; also added `maxWorkers: 1` (parallel jest-expo workers were exhausting available memory in this sandbox) and a `moduleNameMapper` for the `@/*` alias (needed once real imports existed to test against).
4. **`apps/api`'s `dev` script (`nest start --watch`, `tsc` builder) could not actually run at all.** It failed resolving `@hospital/database` (and any other workspace TS package): that package's `"main"` points at raw `./src/index.ts` — this monorepo consumes workspace packages as TS source everywhere (see `apps/admin`'s `transpilePackages` note), which only ever worked for `apps/api` in tests because `ts-jest` transpiles the whole dependency graph itself; plain `tsc`+`node` was never going to resolve a raw `.ts` "main". **Tried and reverted first:** `tsx watch src/main.ts` does fix the resolution problem (esbuild-based, confirmed working, NestJS DI included) but breaks `@nestjs/swagger`'s route-parameter introspection (`TypeError` in `ParameterMetadataAccessor.explore` — esbuild's decorator-metadata emission isn't a safe drop-in here). **Fixed properly** with `node -r ts-node/register/transpile-only --watch src/main.ts` — `ts-node` uses the real TypeScript compiler (not esbuild), so `emitDecoratorMetadata` stays correct while still transpiling workspace `.ts` on the fly. Verified end-to-end against the pglite stand-in: clean boot, `/health` and `/health/ready` (real DB check) both respond, `/api/v1/docs-json` (the thing that broke under `tsx`) responds correctly, a real `/auth/login` against seeded demo data succeeds and issues a working JWT, and `--watch` correctly detects a source-file edit and restarts the process (confirmed twice). `build`/`start` (`nest build` + `node dist/main.js`) share the identical root cause and remain unfixed — out of scope for this pass (which was scoped to the dev server specifically) but a real gap before Render deployment (Phase 15); the same `ts-node`-based approach, or building workspace packages to real JS with `"main"` pointing at `dist/`, are the two realistic fixes.

## Current feature

None in progress — Phase 3 is closed out. Next unit of work is Phase 4 (`T-401`: Hospital module, Super Admin CRUD).

## Known issues

- **Docker unavailable in this development environment** (carried over from Phase 2). All Phase 3 integration-test verification used `@electric-sql/pglite` + `pglite-socket` as a temporary WASM Postgres stand-in (never committed, recreated fresh per verification session), requiring two non-default Prisma connection-string flags (`?pgbouncer=true` to disable named prepared statements, `&connection_limit=1` to avoid the stand-in's concurrent-connection limitation) — both are artifacts of that specific tool, **not** requirements of the real docker-compose/Supabase Postgres this project targets. Confirm the full `pnpm quality` (including `test:integration`) against real Docker before trusting this as final proof.
- **No simulator, Expo Go, or device available in this sandbox for `apps/mobile`.** The 6 new screens are verified via component tests only (React Native Testing Library) — real-device concerns (SecureStore's actual OS-level Keychain/Keystore behavior, real keyboard/`inputMode` behavior, actual navigation transitions, real network timing) are unverified. `expo start --web` was not attempted this pass; it's a plausible partial substitute (react-native-web) worth trying in a future session if a simulator remains unavailable.
- `packages/ui/web` and `packages/ui/native` were empty Phase 1 placeholders (`export {}`) until this phase — both now have their first real components (5 in each), sized exactly to what the auth screens needed. Expect them to grow again alongside Phase 4's admin shell (`T-405`) and Phase 5's patient-facing screens.
- Same carryover from Phase 1/2: the `jest-expo`/`expo-router` React 19 RC peer-dependency warning (harmless, `pnpm install` still succeeds).
- `/health/ready` now performs a real `$queryRaw` DB-reachability check (closed out from Phase 2's "known issue" list).
- OTP delivery is still a `console.warn`-based dev stub (`OtpService.deliver()`, clearly marked `[DEV ONLY]` in the code and docstring) — real email/SMS delivery is Phase 10's notification system. Do not treat this as production-ready; it's called out again here so it isn't missed.
- Mobile Login's "resume OTP verification for a pending-activation account" flow (docs/08) is intentionally not implemented — see the Mobile section above.

## Database migration status

Unchanged from Phase 2 — schema/migration complete, not yet applied to any real environment (no local Docker Postgres run yet, no Supabase project provisioned). Phase 3 introduced no schema changes (the User/RefreshToken/DeviceSession/OtpChallenge tables were already fully modeled in Phase 2).

## API status

Full auth surface live: `/auth/{register,verify-otp,resend-otp,login,refresh,logout,forgot-password,reset-password,sessions,sessions/:id,me}`, global guard chain, exception filter, audit interceptor, Swagger doc generation at `/api/v1/docs`. `pnpm --filter api dev` now actually runs in this sandbox (see "Completed features" above) — confirmed via a real boot + `/health` + `/health/ready` + a live `/auth/login` against seeded demo data. `build`/`start` (the `nest build`/`node dist/main.js` production path) remain unfixed — same root cause, different fix needed, see the note in "Completed features." No other domain modules yet — all Phase 4+.

## Mobile status

Auth stack complete (Splash → Welcome → Login/Register → OTP Verification → Forgot/Reset Password), wired into `expo-router`'s root `Stack`. Patient Home and everything past Splash's authenticated branch is a placeholder pending Phase 5.

## Admin status

Unauthenticated auth pages complete (Login, Forgot Password, Reset Password). The authenticated shell (sidebar/topbar, permission-driven nav, hospital switcher) is Phase 4's `T-405`; the root `/` route currently just redirects to `/login` or shows a bare "Welcome, {name}" placeholder depending on session state.

## Testing status

Local quality gate (`pnpm lint && pnpm typecheck && pnpm test`, run via `turbo` with reduced concurrency to fit this sandbox's available memory — see note below) passing across all 11 packages. Test counts as of this update: `apps/api` 17 unit + 16 integration, `packages/shared` 15, `packages/validation` 15, `packages/database` 5, `packages/ui/tokens` 3, `apps/admin` 11 component tests (new), `apps/mobile` 18 component tests (new, and the first ever to run — see "Known issues" in the Phase 3 section above for the pnpm/jest-expo compatibility fix this required). No E2E specs or authorization/tenant-isolation suite yet — those depend on domain modules Phase 4+ introduces.

Note on running the workspace-wide gate in this sandbox: `pnpm quality`/`pnpm lint`/`pnpm typecheck`/`pnpm test` at the root, run through `turbo`'s default full parallelism, can exhaust this sandbox's available memory (observed as V8 OOM crashes in unrelated packages, not a real failure). Re-running with `pnpm exec turbo run <task> --concurrency=2` reliably passes. Likely sandbox-specific, not a real CI concern, but worth knowing if a future session sees a mysteriously OOM-ing `pnpm quality`.

## Deployment status

Not started. Vercel/Render/Supabase topology and manual deployment workflow specified in [32-DEPLOYMENT.md](32-DEPLOYMENT.md); no environments are currently provisioned (Phase 15).

## How to update this file

After any implementation milestone in Stage 2: update "Current phase"/"Current feature," move newly-shipped items into "Completed features," update the five status sections above to reflect what's actually working locally/deployed (not just written), and log any new known issue with enough context (symptom, suspected cause if known, affected task ID) for a future session to pick it up cold.
