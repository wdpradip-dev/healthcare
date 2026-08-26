# Integration tests

Runs against a real, ephemeral Postgres instance (via `docker-compose`, migrated fresh per run) — see [docs/30-TESTING-STRATEGY.md](../../../docs/30-TESTING-STRATEGY.md). No mocked ORM: the correctness this system depends on most (unique constraints, transactions — see [docs/19-APPOINTMENT-ENGINE.md](../../../docs/19-APPOINTMENT-ENGINE.md)) can't be verified against one.

Files here follow the `*.integration-spec.ts` naming convention, colocated per domain as domain modules are added starting Phase 3. Empty in Phase 1 — there's nothing to integration-test until `packages/database` has a real schema (Phase 2).
