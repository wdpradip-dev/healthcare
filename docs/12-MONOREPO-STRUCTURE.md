# 12 — Monorepo Structure

## Tooling

- **Package manager:** pnpm (workspaces) — fast, disk-efficient, strict dependency resolution (prevents phantom cross-package imports). Recorded as [ADR-005](43-ARCHITECTURE-DECISIONS.md).
- **Task runner:** Turborepo for cached, parallelized builds/lint/test across apps and packages.
- **Language:** TypeScript everywhere, `strict: true`, one root `tsconfig.base.json` extended per package.

## Structure

```
/
├── apps/
│   ├── mobile/                 # Expo/React Native patient app
│   │   ├── app/                # Expo Router routes
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/       # feature-scoped hooks/queries/screens
│   │   │   ├── lib/
│   │   │   └── theme/
│   │   ├── app.config.ts
│   │   └── package.json
│   │
│   ├── admin/                  # Next.js admin/staff console
│   │   ├── app/                # App Router routes (route groups per module)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── api/                    # NestJS backend
│       ├── src/
│       │   ├── modules/        # auth, users, patients, doctors, appointments,
│       │   │                   # consultations, medical-records, prescriptions,
│       │   │                   # reports, documents, notifications, analytics,
│       │   │                   # audit-logs, settings ...
│       │   ├── common/         # guards, interceptors, pipes, decorators
│       │   ├── jobs/           # queue processors/workers
│       │   └── main.ts
│       ├── test/                # integration + e2e API tests
│       └── package.json
│
├── packages/
│   ├── database/                # Prisma schema, migrations, seed scripts, Prisma client export
│   ├── shared/                  # cross-cutting utilities: object-storage abstraction,
│   │                             # error classes, date/time helpers, permission constants
│   ├── types/                   # shared TS types/DTOs generated or hand-authored from the API contract
│   ├── validation/               # Zod schemas shared by admin, mobile, and API DTO validation
│   ├── config/                   # typed environment/config loader shared across apps
│   └── ui/                       # design tokens + primitive components split by target
│       ├── tokens/                # framework-agnostic token JSON (source of truth, see 45-DESIGN-TOKENS.md)
│       ├── native/                 # React Native component primitives (mobile)
│       └── web/                    # React/Tailwind component primitives (admin)
│
├── docs/                          # this specification
├── scripts/                       # repo automation: bootstrap, db reset, codegen
├── docker-compose.yml
├── turbo.json
├── package.json                   # workspace root
├── pnpm-workspace.yaml
├── .env.example
├── README.md
└── CLAUDE.md
```

## Dependency direction rules

- `apps/*` may depend on any `packages/*`.
- `packages/*` never depend on `apps/*`.
- `packages/database` is the **only** package that imports Prisma-generated types/client; `apps/api` consumes it through repository/service classes, not by importing `@prisma/client` directly in controllers.
- `packages/ui/native` and `packages/ui/web` both depend on `packages/ui/tokens`, never on each other.
- `packages/validation` has zero runtime dependency on NestJS or React/React Native — it must be importable from all three apps unmodified.

## Why this structure over the "may improve" alternative

The requested structure is kept as-is with one addition (`packages/ui` split into `tokens/native/web` rather than one flat folder) because a single shared React component tree cannot realistically serve both React Native and Next.js — splitting at the token layer (not the component layer) is the actual reusable boundary. This is recorded as [ADR-010](43-ARCHITECTURE-DECISIONS.md) as the one structural deviation from the brief.

## Environment & config

- One `.env` per app in local dev (`apps/api/.env`, `apps/admin/.env.local`, `apps/mobile/.env`), all validated at startup via `packages/config` (Zod-validated env schema — fail fast on missing/malformed config). Full variable catalog in [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md).

## Code generation flow

`packages/database` (Prisma schema) → `prisma generate` produces the Prisma Client consumed only inside `apps/api`. API request/response DTOs are hand-authored Zod schemas in `packages/validation` (source of truth) with TypeScript types inferred (`z.infer`) and re-exported via `packages/types` for use in mobile/admin data-fetching hooks — this keeps client and server validation logically identical without a runtime codegen step in MVP (an OpenAPI-client-codegen step is a documented Post-MVP improvement, not required for launch).
