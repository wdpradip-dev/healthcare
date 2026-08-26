# 30 — Testing Strategy

## Layers

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Jest | Pure functions, service-layer business logic (slot computation, scope resolution, validation schemas), React/React Native component logic in isolation |
| Integration | Jest + a real test Postgres instance (via `docker-compose`, migrated fresh per test run) | NestJS modules against a real database — no mocked ORM, since the correctness this system most depends on (unique constraints, transactions) can't be verified against a mock |
| API (contract) | Jest + Supertest against a running API instance | Full request/response cycle per endpoint: auth, validation, permission, response shape |
| Component | React Native Testing Library (mobile), React Testing Library (admin) | Screen-level rendering, interaction, accessibility roles |
| E2E | **Playwright** (admin web), **Maestro** (mobile — confirmed, [ADR-013](43-ARCHITECTURE-DECISIONS.md)) | Full user journeys across a real (test-environment) stack |
| Security | Integration tests + manual review pass | Authorization matrix, tenant isolation, auth abuse cases |

## Required coverage areas (non-negotiable, not just "nice to have")

1. **Authorization matrix** — for every permission in the catalog, at least one test proving a granted role succeeds, an ungranted role gets `403`, and a correctly-permissioned actor targeting another tenant's resource gets `404`. See [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md).
2. **Tenant isolation** — every list/detail/mutate endpoint attempted cross-hospital, asserting no leakage. See [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md).
3. **Appointment conflict** — concurrent booking requests for the same slot (fired via `Promise.all` against two API calls in an integration test) must yield exactly one `201` and one `409 APPOINTMENT_CONFLICT`; same pattern for reschedule races. See [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md).
4. **Auth abuse cases** — lockout threshold, OTP exhaustion/expiry, refresh-token reuse detection and family revocation, password-reset session invalidation.
5. **Report pipeline gating** — a report cannot become patient-visible before `RELEASED`; `reports.verify` cannot be exercised by a non-Doctor; AI summary always carries its provenance flag together, never separately fetchable in a way that decouples them.
6. **Medical-record immutability** — finalized consultations/prescriptions/released reports reject in-place edits at the API level (no update route exists, or the route explicitly rejects once in a terminal state).
7. **Mobile & Admin coverage** — every screen in [08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md)/[09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md) has at minimum: a render test, a loading-state test, an empty-state test, and an error-state test.

## Test data & environment

- Integration/API tests run against an ephemeral Postgres instance provisioned per test run via `docker-compose`, migrated with Prisma, and seeded with the fixture set in [36-SEED-DATA.md](36-SEED-DATA.md) — never against a shared persistent database, to keep tests deterministic and parallelizable.
- E2E tests run against a full local stack (API + admin via Playwright; a local Expo dev build via Maestro for mobile) started via `docker-compose` in a dedicated `test` environment profile, run locally before every deploy per the manual workflow in [32-DEPLOYMENT.md](32-DEPLOYMENT.md) (there is no hosted CI to run them automatically).
- Third-party providers (push, email, SMS, Groq AI report-assist) are always mocked/stubbed in automated tests via the provider-abstraction interfaces described in [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md) — no test suite makes a real external network call.

## Critical user journeys (full step enumeration in [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md))

1. Patient registers → verifies OTP → books an appointment → checks in → (staff-side) completes a consultation → patient views the resulting record/prescription/report.
2. Two patients race to book the last available slot.
3. Receptionist registers a walk-in patient and books/checks them in.
4. Doctor conducts a full consultation: vitals → notes → diagnosis → prescription → report order → complete.
5. A report moves through the full pipeline including an AI-assisted step, ending in patient visibility.
6. Admin invites a new Doctor, assigns them to a Department, configures their schedule, and the doctor becomes bookable.
7. A refresh token is replayed after rotation — the session family is revoked and the user is alerted.
8. A Doctor at Hospital A attempts to access a patient record only associated with Hospital B — denied.

## Local quality gate (replaces CI gates)

With no hosted CI/CD ([ADR-011](43-ARCHITECTURE-DECISIONS.md)), the equivalent of a CI gate is a required local step before any deploy: `pnpm quality` runs lint, type-check (`tsc --noEmit` across all packages/apps), unit tests, integration tests, and the authorization/tenant-isolation suite in sequence, failing fast on the first failure. E2E (Playwright + Maestro) and the accessibility audit are run locally on a pre-deploy cadence (not on every commit, to keep the inner dev loop fast) but are a hard gate before any Staging/"Production" deploy, per [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md) — enforced by discipline (the deployment workflow in [32-DEPLOYMENT.md](32-DEPLOYMENT.md) states this as a required step), since there is no pipeline to enforce it mechanically.

## Definition of "tested" for a feature

A feature is not considered complete (see the Implementation Quality Gate in the project brief / [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md)) until it has: unit coverage for its business logic, an integration test for its primary success path, an integration test for each documented error state in [04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md), an authorization test per permission it touches, and — for anything patient- or admin-facing — a component/render test covering loading/empty/error states.
