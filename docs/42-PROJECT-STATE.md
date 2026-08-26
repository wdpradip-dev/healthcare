# 42 — Project State

**Last updated:** 2026-08-25 · **Updated by:** Phase 2 implementation

This file is the single current-moment snapshot of where the project actually is. It is updated after every meaningful implementation milestone (per the PLAN → ... → UPDATE PROJECT STATE cycle in [40-ROADMAP.md](40-ROADMAP.md)) — if this file and a phase's task statuses in [41-TASKS.md](41-TASKS.md) ever disagree, treat that as a bug to fix immediately, not a stale-doc shrug.

## Current phase

**Phase 2 — Database: COMPLETE.** All tasks `T-201`–`T-207` done (see [41-TASKS.md](41-TASKS.md)). Next: **Phase 3 — Authentication / RBAC** (`T-301` onward).

## Decision update: GitHub added for source control (2026-08-25)

Partway through Phase 2, the user reversed half of the original "no GitHub" decision ([ADR-011](43-ARCHITECTURE-DECISIONS.md), originally recorded during Stage 1 → Stage 2 transition): they created `github.com/wdpradip-dev/healthcare`, set a repo-local git identity (not global), and added it as the `origin` remote. GitHub is now used for source-control backup/history only — **the "no hosted CI/CD" half of the decision is unchanged**, no GitHub Actions workflow exists or is planned, and deploys remain the manual CLI-driven workflow in [32-DEPLOYMENT.md](32-DEPLOYMENT.md). ADR-011, `CLAUDE.md`, and the deployment docs were updated in the same change to stop claiming "no GitHub" outright.

## Completed features

None yet as user-facing features — Phases 1–2 are infrastructure and data-layer foundations. What exists and is verified working:

**Phase 1** (see prior entries in git history for detail): monorepo scaffold, all 11 packages, health-check API, admin/mobile bootstrap.

**Phase 2:**
- Full Prisma schema (`packages/database/prisma/schema.prisma`) — all ~35 models from [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md), every enum, every relation, matching the ERD in [14-DATABASE-ERD.md](14-DATABASE-ERD.md) exactly.
- Initial migration (`prisma/migrations/20260825114948_init/`) — generated via `prisma migrate diff --from-empty --to-schema-datamodel --script` (no live DB connection needed for generation) plus hand-written additions: the appointment-conflict partial unique index, a partial unique index closing a NULL-semantics gap in the system-role uniqueness constraint (newly discovered and documented in [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md)), and the users email-or-phone check constraint.
- Catalog seed (`pnpm db:seed`, always safe including "production"): all 42 permissions, all 6 system roles with their exact permission+scope grants transcribed from [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md), 50 starter medications.
- Demo seed (skipped when `NODE_ENV=production`): 2 hospitals ("City General Hospital", "Lakeside Medical Center"), 4 branches, 16 departments, 17 doctors (including the exact named fixtures from docs/08 and docs/09 — Dr. Sarah Patel, Dr. Amit Shah, Dr. Raj Mehta — with real weekly schedules and a leave exception each), 8 staff (including Meera Nair, John Lee), 40 patients (including Alice Kumar, Ben Ortiz, Carla Diaz), 27 appointments spanning every status, 7 full clinical journeys deterministically covering all 5 report-pipeline stages and all 3 AI verify-decision variants (accept/edit/discard) plus one prescription correction/supersession chain, sample audit logs, sample notifications.
- `SUPER_ADMIN` bootstrap script (`pnpm --filter @hospital/database db:bootstrap-super-admin`) — reads credentials from required env vars, refuses to run without them, idempotent.
- Soft-delete Prisma Client extension (`createPrismaClient()` in `@hospital/database`) — excludes `deletedAt`-set rows from `findFirst`/`findMany`/`count`/`aggregate`/`groupBy` by default on the 9 soft-deletable models, without overriding a caller's own explicit `deletedAt` condition.
- `pg` (shared `hashPassword`/`verifyPassword`, argon2id) added for the bootstrap script and Phase 3's future auth module to share one implementation.
- Local migration smoke-test script (`pnpm db:migration-smoke-test`) — ephemeral Docker Postgres container, `migrate deploy`, schema/constraint verification, teardown. Standalone, not chained into `pnpm quality`.

**Verified, unusually thoroughly given this environment has no Docker/Postgres available:** the full migration SQL, the full seed script (catalog + demo), the bootstrap script's query patterns, and the soft-delete extension were all validated end-to-end against a real (WASM-compiled) Postgres engine (`@electric-sql/pglite` + `@electric-sql/pglite-socket`, used as a temporary local testing stand-in, not part of the shipped project). Confirmed: migration applies cleanly from empty; both hand-written partial indexes and the check constraint exist and function (a real conflicting-appointment insert was attempted and correctly rejected); the full seed produces exactly the expected row counts and exactly the expected report-pipeline-stage/AI-decision coverage; the soft-delete extension correctly hides a soft-deleted row from `findFirst` while still allowing an explicit `deletedAt` override and still allowing `findUnique` by id. This is strong evidence of correctness but is **not** the same as having run it against a real Postgres via Docker/Supabase — that remains genuinely unverified in this environment and should be the first thing confirmed once Docker or a Supabase project is available.

## Current feature

None in progress — Phase 2 is closed out. Next unit of work is Phase 3 (`T-301`: NestJS bootstrap with global pipes/filters/interceptors scaffold).

## Known issues

- **Docker unavailable in this development environment.** The `docker-compose.yml` Postgres/MinIO services and the new `db:migration-smoke-test` script are written and reviewed but have never been run via actual Docker here — only via the pglite stand-in described above. Confirm both work with real Docker before relying on them.
- A "prepared statement already exists" error occurs when a *second, separate* Node process connects to the same long-lived `pglite-socket` test server used during Phase 2 verification — confirmed (by reproducing the identical query pattern successfully within a single process) to be an artifact of that specific testing tool's connection handling, not a bug in the bootstrap script or any application code. Irrelevant once running against real Postgres (Supabase/Docker), which handles per-connection prepared statement namespaces correctly; noted here only so a future session doesn't waste time re-diagnosing it if it resurfaces during further pglite-based experimentation.
- Same carryover from Phase 1: the `jest-expo`/`expo-router` React 19 RC peer-dependency warning; `/health/ready` in `apps/api` still doesn't check real dependencies (now that `packages/database` has a real client, wiring an actual DB-reachability check into it is a natural, small Phase 3 addition).

## Database migration status

Schema and initial migration complete (see above). Not yet applied to any real environment (no local Docker Postgres run yet, no Supabase project provisioned). Next schema change happens alongside whichever Phase 3 auth requirement needs it (expected: none — the User/RefreshToken/DeviceSession/OtpChallenge tables are already fully modeled).

## API status

Bootstrap only, unchanged from Phase 1: `apps/api` runs, serves `/health`, `/health/ready`, and an empty Swagger doc. No domain modules, no auth, no guards/interceptors/pipes yet — all Phase 3.

## Mobile status

Unchanged from Phase 1 — bootstrap only.

## Admin status

Unchanged from Phase 1 — bootstrap only.

## Testing status

Local quality-gate script (`pnpm quality`) passing across all 11 packages, now including unit tests for the permission catalog, error codes, design tokens, env loader, health controller, password hashing, and the soft-delete extension's filter logic (24 unit tests total). No integration tests, E2E specs, or authorization/tenant-isolation suite yet — those depend on the domain modules Phase 3 introduces.

## Deployment status

Not started. Vercel/Render/Supabase topology and manual deployment workflow specified in [32-DEPLOYMENT.md](32-DEPLOYMENT.md); no environments are currently provisioned (Phase 15).

## How to update this file

After any implementation milestone in Stage 2: update "Current phase"/"Current feature," move newly-shipped items into "Completed features," update the five status sections above to reflect what's actually working locally/deployed (not just written), and log any new known issue with enough context (symptom, suspected cause if known, affected task ID) for a future session to pick it up cold.
