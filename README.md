# Hospital Management and Patient Appointment Platform

A multi-hospital, multi-branch hospital management and patient appointment platform: a React Native/Expo patient app, a Next.js staff/admin console, and a NestJS API over PostgreSQL.

Repository: [github.com/wdpradip-dev/healthcare](https://github.com/wdpradip-dev/healthcare)

> **Scope note:** this is a learning/demonstration project. Every environment runs on synthetic/fixture data only — real patient data is never entered. See [docs/26-PRIVACY-AND-DATA-PROTECTION.md](docs/26-PRIVACY-AND-DATA-PROTECTION.md) and [ADR-014](docs/43-ARCHITECTURE-DECISIONS.md). The engineering practices (security, RBAC, audit logging, testing) are still built to a production-grade standard — only the data is fictitious.

## Documentation

Full product, design, architecture, database, API, security, and delivery specification lives in [`docs/`](docs/00-PROJECT-OVERVIEW.md) — start there. Key entry points:

- [00-PROJECT-OVERVIEW.md](docs/00-PROJECT-OVERVIEW.md) — vocabulary, document index
- [11-SYSTEM-ARCHITECTURE.md](docs/11-SYSTEM-ARCHITECTURE.md) / [12-MONOREPO-STRUCTURE.md](docs/12-MONOREPO-STRUCTURE.md) — how the system fits together
- [13-DATABASE-DESIGN.md](docs/13-DATABASE-DESIGN.md) / [15-API-SPECIFICATION.md](docs/15-API-SPECIFICATION.md) — data and API contracts
- [40-ROADMAP.md](docs/40-ROADMAP.md) / [41-TASKS.md](docs/41-TASKS.md) / [42-PROJECT-STATE.md](docs/42-PROJECT-STATE.md) — what's being built, in what order, and current status
- [43-ARCHITECTURE-DECISIONS.md](docs/43-ARCHITECTURE-DECISIONS.md) — why things are built the way they are

## Stack

- **Mobile:** React Native + Expo + TypeScript + Expo Router (patient app only — see [ADR-008](docs/43-ARCHITECTURE-DECISIONS.md))
- **Admin/Staff console:** Next.js + TypeScript + Tailwind CSS
- **API:** NestJS + TypeScript + Prisma + PostgreSQL
- **Hosting:** Vercel (admin) + Render (API/worker) + Supabase (Postgres + Storage) — see [ADR-011](docs/43-ARCHITECTURE-DECISIONS.md)
- **AI:** Groq, behind a provider abstraction, human-reviewed only — see [27-MEDICAL-AI-SAFETY.md](docs/27-MEDICAL-AI-SAFETY.md)

## Monorepo layout

```
apps/
  mobile/    Expo patient app
  admin/     Next.js staff/admin console
  api/       NestJS backend
packages/
  database/  Prisma schema, migrations, seed scripts
  shared/    Cross-cutting utilities (object storage abstraction, error classes, ...)
  types/     Shared TypeScript types
  validation/ Shared Zod schemas
  config/    Typed environment/config loader
  ui/        Design tokens + platform-specific component primitives (tokens/native/web)
```

Full rationale in [docs/12-MONOREPO-STRUCTURE.md](docs/12-MONOREPO-STRUCTURE.md).

## Getting started

Prerequisites: Node ≥20, [pnpm](https://pnpm.io) 9.x, Docker (for local Postgres/MinIO).

```bash
pnpm install

# start local Postgres + object storage
docker compose up -d postgres object-storage

# copy env files and fill in local values
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# once packages/database has a schema (Phase 2):
pnpm db:migrate
pnpm db:seed

pnpm dev
```

`pnpm dev` runs every app in parallel via Turborepo. To run one app: `pnpm --filter api dev`, `pnpm --filter admin dev`, `pnpm --filter mobile start`.

## Quality gate

There is no hosted CI/CD ([ADR-011](docs/43-ARCHITECTURE-DECISIONS.md) — GitHub hosts the source repository, but nothing there triggers automated builds or deploys). Run the full local quality gate before every commit/deploy:

```bash
pnpm quality
```

This chains lint → type-check → unit tests → integration tests → the authorization/tenant-isolation suite. See [docs/30-TESTING-STRATEGY.md](docs/30-TESTING-STRATEGY.md).

## Deployment

Manual, CLI-driven deploys to Vercel (admin), Render (API/worker), and Supabase (database migrations) — no pipeline. Full step-by-step workflow: [docs/32-DEPLOYMENT.md](docs/32-DEPLOYMENT.md).

## Contributing conventions

See [docs/44-CODING-STANDARDS.md](docs/44-CODING-STANDARDS.md) for naming, folder structure, and commit conventions, and [CLAUDE.md](CLAUDE.md) for repo-specific guidance when working with Claude Code.
