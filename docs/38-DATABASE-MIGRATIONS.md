# 38 — Database Migrations

## Tooling

Prisma Migrate. `packages/database/prisma/schema.prisma` is the single source of truth for the schema; `packages/database/prisma/migrations/` holds the generated, timestamped SQL migration history, committed to version control (never generated ad hoc in an environment and discarded).

## Workflow

- **Local development:** `prisma migrate dev` — generates a new migration from schema changes, applies it to the local dev database, regenerates the Prisma Client. Developers name migrations descriptively (`add_appointment_partial_unique_index`, not `migration_17`).
- **Local quality gate:** migrations are applied to an ephemeral test database (`prisma migrate deploy`) as part of the `pnpm quality` integration-test setup step ([30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)), verifying the migration set is internally consistent and applies cleanly from scratch — run locally before every deploy, since there is no hosted CI to run it automatically.
- **Staging/"Production":** `prisma migrate deploy` runs as an explicit, manually-triggered step against the target Supabase project (per [32-DEPLOYMENT.md](32-DEPLOYMENT.md)'s manual deployment workflow, since there is no hosted CI/CD) — never `migrate dev` (which can prompt for destructive resets) and never triggered automatically by application boot.

## Expand/contract discipline for zero-downtime changes

Because API instances roll out gradually (old and new code briefly coexist during a deploy), any migration that a currently-running *old* code version would break is done in two phases across two deploys, not one:

1. **Expand:** add the new column/table/index as nullable/optional or with a safe default; old code ignores it, new code (deployed after this migration) can start using it.
2. **Backfill** (if needed): a separate data-migration step (script, not a schema migration) populates historical rows.
3. **Contract:** a later deploy makes the column required/drops the old column, once no running code references the old shape.

Example: renaming `Appointment.notes` to `Appointment.reason` would be `add reason (nullable) → backfill reason from notes → deploy code reading/writing reason → drop notes`, across separate migrations/deploys, not one destructive rename-in-place.

## Rules

- **No destructive migration ships without a preceding expand phase** for any column/table that has live production traffic reading/writing it — this is a hard rule, not a case-by-case judgment call, given the cost of getting it wrong on clinical data.
- **Additive-first:** prefer adding new nullable columns/tables over altering existing ones when a change is ambiguous about whether it's expand or contract.
- **Every migration is reviewed** in the same PR review process as code — a migration is a code change with higher blast radius, not a lesser artifact.
- **Partial/conditional indexes** (like the appointment conflict-prevention index in [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)) are written as raw SQL within a Prisma migration (`prisma migrate dev --create-only` then hand-edit) since Prisma's schema DSL doesn't natively express a partial unique index — documented inline in the migration file with a comment explaining the constraint's purpose, since raw SQL in an otherwise-generated migration set is exactly the kind of thing a future reader needs context for. The same technique also closes a subtler gap: Postgres treats every `NULL` in a unique constraint as distinct from every other `NULL`, so a plain `@@unique([hospitalId, key])` on `Role` does not actually stop two system roles (`hospitalId IS NULL`) from being seeded with the same `key` — only hospital-scoped custom roles are protected by that index. A second partial index, `UNIQUE (key) WHERE hospital_id IS NULL`, closes that gap for the system-role catalog specifically. Any other nullable column participating in a composite unique constraint should be checked for the same gap before assuming the plain index is sufficient.
- **Enum changes:** Postgres enum alteration (adding a value) is additive-safe; removing/renaming an enum value follows the same expand/contract pattern (add new value, migrate data/code off the old value, remove old value in a later migration) since a live enum value removal while old code still writes it would fail.

## Seed vs. migration

Seed data ([36-SEED-DATA.md](36-SEED-DATA.md)) is never embedded inside a migration file — migrations change structure, seed scripts populate data, and conflating them makes it impossible to run a clean structural migration against a production database without also re-running (and potentially re-triggering the production-guard on) seed logic.

## Migration review checklist (applied in code review)

- Does this change break any currently-deployed API version's queries? If yes, is it split into expand/contract phases?
- Does it add/modify an index needed for a query already in the codebase (or about to ship in the same PR)?
- Does it touch a tenant-scoped table — is `hospitalId` present and indexed on any new table?
- Does it touch a clinical entity — does soft-delete (`deletedAt`) exist where the entity design calls for it per [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)?
- Is the migration's down/rollback story understood (even if forward-only is the operational default per [32-DEPLOYMENT.md](32-DEPLOYMENT.md))?
