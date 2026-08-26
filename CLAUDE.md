# CLAUDE.md

Guidance for Claude Code (or any future agent) working in this repository.

## What this is

A Hospital Management and Patient Appointment Platform: React Native/Expo patient app, Next.js staff/admin console, NestJS API, PostgreSQL via Prisma. **Learning/demo project — synthetic data only, real patient data is never entered in any environment.** See [docs/26-PRIVACY-AND-DATA-PROTECTION.md](docs/26-PRIVACY-AND-DATA-PROTECTION.md) and [ADR-014](docs/43-ARCHITECTURE-DECISIONS.md). The engineering is still built to a production-grade standard — only the data is fictitious.

## Process state

**Stage 1 (documentation) is complete and approved. Stage 2 (implementation) is in progress.** Before doing any work in this repo:

1. Read [docs/42-PROJECT-STATE.md](docs/42-PROJECT-STATE.md) — current phase, what's done, what's in progress, known issues.
2. Read [docs/41-TASKS.md](docs/41-TASKS.md) — the granular backlog with IDs, dependencies, and status.
3. Read [docs/40-ROADMAP.md](docs/40-ROADMAP.md) — phase order and why it's ordered that way.
4. Check `git status` / `git log` — the actual repo state is the ground truth; if it disagrees with `42-PROJECT-STATE.md`, fix the doc, don't trust it blindly.

Implementation proceeds **phase by phase**, and each phase follows: PLAN → DATABASE → BACKEND → API → ADMIN → MOBILE → TEST → SECURITY REVIEW → DOCUMENTATION → UPDATE PROJECT STATE. Do not skip ahead to a later phase's work, and do not skip the TEST/SECURITY REVIEW/DOCUMENTATION/UPDATE PROJECT STATE steps because they feel like overhead — they're how `docs/42-PROJECT-STATE.md` stays trustworthy.

A feature/phase is not "done" until it passes the Definition of Done in [docs/39-PRODUCTION-READINESS.md](docs/39-PRODUCTION-READINESS.md). Never report something complete when TypeScript errors, lint errors, failing tests, or missing authorization checks are still present.

## The specification is authoritative

`docs/` is not background reading — it's the contract. Specifically:

- **Database:** [docs/13-DATABASE-DESIGN.md](docs/13-DATABASE-DESIGN.md) / [docs/14-DATABASE-ERD.md](docs/14-DATABASE-ERD.md) define every entity, field, and relationship. Don't invent fields or rename things ad hoc — if the schema needs to change, update the doc in the same change.
- **API:** [docs/15-API-SPECIFICATION.md](docs/15-API-SPECIFICATION.md) defines every route, permission, and error code. [docs/37-API-EXAMPLES.md](docs/37-API-EXAMPLES.md) has worked request/response payloads.
- **Permissions:** [docs/02-PERSONAS-AND-ROLES.md](docs/02-PERSONAS-AND-ROLES.md) is the canonical `resource.action` permission catalog. Authorization code is written against these exact strings — see [docs/17-AUTHORIZATION-RBAC.md](docs/17-AUTHORIZATION-RBAC.md) for the enforcement mechanism (permission check + scope check, both server-side, never role-name string matching).
- **Multi-tenancy:** every tenant-scoped table carries `hospitalId`. [docs/18-MULTI-TENANCY.md](docs/18-MULTI-TENANCY.md) describes the layered enforcement (JWT-derived hospitalId → repository-layer scoping → guard-layer re-check → DB constraint backstop) — all four layers are required, not optional hardening.
- **Appointments:** the no-double-booking guarantee comes from a **database partial unique index**, not application logic alone. Read [docs/19-APPOINTMENT-ENGINE.md](docs/19-APPOINTMENT-ENGINE.md) before touching booking/reschedule/cancel code.
- **AI features:** Groq, only via the `AiReportAssistProvider` abstraction in `packages/shared`. AI output is never auto-released to a patient and never becomes a diagnosis — see [docs/27-MEDICAL-AI-SAFETY.md](docs/27-MEDICAL-AI-SAFETY.md). This rule has no exceptions.
- **Design:** [docs/07-DESIGN-SYSTEM.md](docs/07-DESIGN-SYSTEM.md) (narrative) + [docs/45-DESIGN-TOKENS.md](docs/45-DESIGN-TOKENS.md) (literal values) are the single source of truth, surfaced in code via `packages/ui/tokens`. Screen-level layout: [docs/08-MOBILE-DESIGN-MOCKUPS.md](docs/08-MOBILE-DESIGN-MOCKUPS.md) / [docs/09-ADMIN-DESIGN-MOCKUPS.md](docs/09-ADMIN-DESIGN-MOCKUPS.md).
- **Errors:** [docs/28-ERROR-HANDLING.md](docs/28-ERROR-HANDLING.md) is the canonical error-code registry. New codes are added there first.

If an implementation decision isn't covered by `docs/`, or contradicts it, resolve the contradiction in the docs (update the relevant file, note it in [docs/43-ARCHITECTURE-DECISIONS.md](docs/43-ARCHITECTURE-DECISIONS.md) if it's architecturally significant) rather than silently diverging from what's written.

## Hosting & deployment (GitHub for source control only, no hosted CI/CD)

Source control is git with a GitHub remote (`origin` → `github.com/wdpradip-dev/healthcare`) — GitHub is used for backup/history only, not automation. There is still no hosted CI/CD. Hosting is Vercel (admin), Render (API/worker), Supabase (Postgres + Storage). Deploys are manual and CLI-driven. Full workflow: [docs/32-DEPLOYMENT.md](docs/32-DEPLOYMENT.md). Before any deploy, run:

```bash
pnpm quality
```

Do not add a GitHub Actions workflow or wire up any hosted CI without an explicit request — a GitHub remote existing is not authorization to automate anything on top of it ([ADR-011](docs/43-ARCHITECTURE-DECISIONS.md)). Do not push to `origin` without being asked, and never force-push.

The repo-local git identity (`git config user.name`/`user.email`, set without `--global`) is scoped to this repository only and intentionally differs from the machine's global git identity — don't "fix" this by copying the global identity in, and don't run `git config --global` here.

## Commands

```bash
pnpm install                    # install all workspace dependencies
pnpm dev                        # run all apps in parallel (Turborepo)
pnpm --filter api dev           # run just the API
pnpm --filter admin dev         # run just the admin console
pnpm --filter mobile start      # run just the mobile app (Expo)
pnpm quality                    # lint + typecheck + unit + integration + auth/tenant-isolation tests
pnpm db:migrate                 # Prisma migrate dev (local)
pnpm db:migrate:deploy          # Prisma migrate deploy (staging/production, manual step per docs/32)
pnpm db:seed                    # seed catalog + demo data (demo seed refuses to run if NODE_ENV=production)
docker compose up -d postgres object-storage   # local Postgres + MinIO (stands in for Supabase locally)
```

## Conventions

Full detail in [docs/44-CODING-STANDARDS.md](docs/44-CODING-STANDARDS.md). The short version:

- TypeScript `strict: true` everywhere. No `any` without a comment justifying it.
- Every NestJS controller method has exactly one of `@Public()` or `@RequirePermission(...)` — no exceptions.
- Zod schemas in `packages/validation` are the single source of truth for a DTO shape, consumed by both API validation and client forms (React Hook Form resolver).
- No inline styles for anything token-governed — always through `packages/ui`.
- Default to no code comments; add one only for a non-obvious *why* (a business rule, a workaround, a genuine invariant).
- Only create commits when the user asks. When asked, follow the repo's existing commit style (see `git log`) and never `--force`, `--amend` published commits, or skip hooks without being told to.

## What NOT to do

- Don't add a GitHub Actions workflow or any hosted CI/CD without an explicit request.
- Don't push to `origin`/GitHub without being asked, and never force-push or push over another session's work without checking first.
- Don't relax authorization, tenant-isolation, or audit-logging "because it's just a demo" — the data is fake, the engineering discipline isn't. See [docs/26-PRIVACY-AND-DATA-PROTECTION.md](docs/26-PRIVACY-AND-DATA-PROTECTION.md).
- Don't let the demo-seed script run with `NODE_ENV=production` — it has a hard-coded guard; don't remove it.
- Don't build any code path where AI-generated content reaches a patient without a clinician's explicit accept/edit/discard decision.
- Don't invent new permission strings, entity fields, or API routes without first updating the corresponding `docs/` file.
