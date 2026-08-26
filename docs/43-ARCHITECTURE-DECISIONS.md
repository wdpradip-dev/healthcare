# 43 — Architecture Decision Records

Format: Context → Decision → Consequences. Each ADR is referenced by number from the document where it's most relevant; this file is the authoritative record.

## ADR-001: NestJS modular monolith, not microservices, for MVP

**Context:** The system has one especially concurrency-sensitive domain (appointment booking) that benefits from single-database transactional guarantees, and is being built by a small team under Stage 2's phased delivery model.

**Decision:** Ship one NestJS service (API) plus one worker process, organized into strictly-bounded feature modules, rather than splitting into per-domain microservices.

**Consequences:** Simpler operations, easier local development, and transactional integrity for the booking-conflict logic in [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md) without distributed-transaction complexity. Tradeoff: the whole API scales as one unit; a future extraction into services remains possible because module boundaries already forbid cross-module direct repository access (each module exposes a service-layer API, never lets another module `import` its Prisma repository directly).

## ADR-002: PostgreSQL as the sole datastore

**Context:** The domain is fundamentally relational (patients, doctors, appointments, consultations with many foreign-key relationships) and requires strong consistency guarantees (no double-booking, immutable clinical records).

**Decision:** PostgreSQL for all persistent data, including semi-structured content (`jsonb` columns for `LabReport.structuredValues`, `AuditLog.beforeState/afterState`) rather than introducing a second document-store for that subset.

**Consequences:** One database technology to operate, back up, and secure. Postgres's native partial unique indexes are what make the appointment-conflict guarantee possible without external locking infrastructure ([19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)). A separate search-optimized store (e.g. for full-text doctor search at large scale) is a plausible Post-MVP addition, not needed at MVP data volumes.

## ADR-003: Prisma as the ORM

**Context:** TypeScript-first stack across all three apps; need type-safe database access, a manageable migration workflow, and a schema that can serve as living documentation.

**Decision:** Prisma ORM, with `packages/database` as the only package that touches the Prisma client directly.

**Consequences:** Strong type inference from schema to query results reduces a whole class of runtime bugs. Tradeoff: Prisma's schema DSL doesn't natively express partial/conditional unique indexes, requiring a hand-edited raw-SQL migration for the appointment-conflict constraint ([38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md)) — an accepted, documented exception rather than a reason to avoid Prisma for everything else.

## ADR-004: Expo (managed workflow) for the mobile app

**Context:** One patient-facing mobile app, Android-first distribution via EAS Build, small team, need for fast iteration without deep native-module maintenance burden.

**Decision:** Expo managed workflow + Expo Router, not bare React Native.

**Consequences:** Faster iteration, EAS Build/Update handle the native build and OTA-update pipeline without the team owning native Xcode/Android Studio project files directly. Tradeoff: any native module not supported by Expo's managed workflow would require an eject/config-plugin approach — assessed as acceptable given the feature set in [05-MOBILE-APP-SPECIFICATION.md](05-MOBILE-APP-SPECIFICATION.md) doesn't currently need anything Expo can't support (camera/document-picker for uploads, push notifications, and secure storage are all Expo-supported).

## ADR-005: pnpm + Turborepo monorepo

**Context:** Three apps and six packages need to share types/validation/config/UI tokens without publishing internal npm packages, and need fast, cacheable CI.

**Decision:** pnpm workspaces for dependency management (strict, disk-efficient, prevents phantom cross-package imports) + Turborepo for task orchestration/caching, structured per [12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md).

**Consequences:** One `pnpm install`, one lockfile, enforced dependency-direction rules (`packages` never depend on `apps`). Turborepo's caching keeps CI fast as the codebase grows. Tradeoff: pnpm's strictness occasionally surfaces previously-silent missing-dependency bugs from other package managers — treated as a benefit (catches real issues) not a cost.

## ADR-006: Pooled (shared-schema) multi-tenancy

**Context:** Patients need to discover and interact with multiple hospitals through one identity and one app; hospitals need strict data isolation from each other.

**Decision:** Single database/schema, `hospitalId` discriminator column denormalized onto every tenant-scoped table, enforced through repository-layer scoping + authorization-guard re-verification + a DB-constraint backstop, per [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md).

**Consequences:** Cross-hospital patient discovery is a normal query, not a fan-out across isolated schemas/databases. Operational simplicity (one backup/migration/connection-pool story). Tradeoff: isolation depends on application discipline rather than physical database separation — accepted because the enforcement mechanisms are layered and each is independently tested, not because isolation is assumed to be "probably fine."

## ADR-007: JWT access token + rotating refresh token authentication

**Context:** Need stateless, horizontally-scalable request authentication, session continuity across app restarts, and strong protection against stolen-token replay.

**Decision:** Short-lived (15 min) RS256-signed JWT access tokens carrying resolved permissions, paired with longer-lived, rotating, one-time-use opaque refresh tokens with reuse-detection (family revocation), per [16-AUTHENTICATION.md](16-AUTHENTICATION.md).

**Consequences:** No server-side session lookup needed to authorize a typical request (fast, horizontally scalable). Refresh rotation + reuse detection gives strong protection against a leaked refresh token being used silently in parallel with the legitimate user. Tradeoff: permission changes take up to 15 minutes to fully propagate to an already-issued access token unless paired with a forced session revocation — judged acceptable for this domain's change frequency (role changes are rare, deliberate admin actions, not something a user expects to take effect mid-request).

## ADR-008: Mobile app is Patient-only; staff/doctor workflows live in the web console

**Context:** The stated tech stack specifies exactly one Expo app and one Next.js app; building a second mobile app for staff would roughly double mobile development/maintenance surface for MVP.

**Decision:** The React Native app serves Patients exclusively. Doctor, Nurse, Receptionist, and Admin all work through the responsive Next.js console, role-gated by module, per [05-MOBILE-APP-SPECIFICATION.md](05-MOBILE-APP-SPECIFICATION.md)/[06-ADMIN-PANEL-SPECIFICATION.md](06-ADMIN-PANEL-SPECIFICATION.md).

**Consequences:** One fewer app to build/ship/maintain in MVP; front-desk/ward tablet use is explicitly supported by the console's responsive-down-to-768px design. Tradeoff: a doctor wanting to document a consultation from a phone in a hallway doesn't have a native mobile flow for that in MVP — flagged as a Post-MVP consideration if real usage patterns show this matters (a dedicated staff mobile app, or a more thoroughly phone-optimized console breakpoint, are both viable follow-ups).

## ADR-009: Redis-backed job queue for async work

**Context:** Notification delivery, AI report-assist calls, and future export/report-generation jobs must not block the request/response cycle and must survive a worker restart without losing work.

**Decision:** A Redis-backed job queue (e.g. BullMQ, given the Node/TypeScript stack) consumed by a dedicated worker process, per [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md).

**Consequences:** Durable, retryable, observable async work with idempotency-key support baked into job payloads. Introduces Redis as an additional infrastructure dependency beyond Postgres — accepted as a small, well-understood operational addition rather than building a hand-rolled Postgres-backed queue, given the retry/backoff/observability BullMQ already provides.

## ADR-010: `packages/ui` split into `tokens/`, `native/`, `web/`

**Context:** The requested monorepo structure specifies a single flat `packages/ui`; React Native and Next.js/React DOM components are not source-compatible with each other despite sharing React.

**Decision:** Split `packages/ui` into a framework-agnostic `tokens/` (the actual shared source of truth) plus separate `native/` and `web/` component-primitive folders, each depending only on `tokens/`, per [12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md).

**Consequences:** A brand/token change (e.g. Primary color) propagates to both apps from one edit. Component-level UI code is still written twice (once per platform) — this is treated as inherent to React Native + React DOM ever being visually consistent while remaining idiomatic to each platform's interaction model (per [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)'s "two surfaces, one brand" framing), not a gap this ADR was meant to close. This is the one recorded structural deviation from the brief's proposed monorepo layout.

## ADR-011: Hosting on Vercel + Render + Supabase; GitHub for source control only, still no hosted CI/CD

**Context:** The user initially confirmed this project's scope as a learning/demo build (see [ADR-014](43-ARCHITECTURE-DECISIONS.md)) and explicitly requested no GitHub involvement at all — neither as a source-control host nor as a CI/CD provider. That was the original decision. Partway through Stage 2, the user reversed the source-control half of it: they created a GitHub repository (`wdpradip-dev/healthcare`), configured repo-local git identity (`user.name`/`user.email` scoped to this repository only, not their global git config), added it as the `origin` remote, and asked for the work to be pushed there.

**Decision:** Source control is a **local git repository with a GitHub remote** (`origin` → `github.com/wdpradip-dev/healthcare`) — GitHub is used purely as a hosted backup/remote for the git history, not as a CI/CD provider. No GitHub Actions workflow exists or is planned; **the "no hosted CI/CD" half of the original decision stands unchanged**. Hosting remains split across three managed platforms chosen for their generous free/low-cost tiers and framework-native fit: **Vercel** for the Next.js admin console, **Render** for the NestJS API and worker (Web Service + Background Worker), and **Supabase** for PostgreSQL (with its pgBouncer connection pooler) and S3-compatible object storage. Deployment is still the documented manual workflow (local quality-gate script → migration → CLI deploy commands per platform → smoke test), detailed in [32-DEPLOYMENT.md](32-DEPLOYMENT.md) — a GitHub remote existing doesn't by itself wire up any automation, and none should be added without a further explicit decision.

**Consequences:** Source history now has an off-machine backup and is shareable via a GitHub URL, without taking on any GitHub Actions maintenance burden. Three hosting accounts/dashboards (Vercel/Render/Supabase) are still managed independently of GitHub, and every deploy still requires a human to run the documented CLI sequence rather than a `git push` triggering automation — that tradeoff from the original decision is unchanged, only the "is the git history backed up anywhere" half of the decision flipped. If the project's scope ever grows to need a team and automated deploys, a hosted CI/CD pipeline (GitHub Actions is now the natural default, given the remote already exists) can be layered onto this same manual workflow without redesigning it.

## ADR-012: Groq as the AI report-assist provider

**Context:** [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md) requires the `AI_ANALYZED` pipeline stage to sit behind a provider-abstraction interface regardless of which vendor is chosen, since AI assistance must remain optional, swappable, and structurally incapable of becoming an autonomous diagnosis.

**Decision:** **Groq** (fast LLM inference API) is the confirmed provider, integrated only through the `AiReportAssistProvider` interface in `packages/shared`, per [27-MEDICAL-AI-SAFETY.md](27-MEDICAL-AI-SAFETY.md).

**Consequences:** Groq's low-latency inference suits the report-summary use case well (a short, bounded generation task, not a long agentic workflow). Because the project's confirmed scope is synthetic data only ([ADR-014](43-ARCHITECTURE-DECISIONS.md)), no data-processing agreement or PHI-handling review of Groq's terms is required for this build; a real deployment would need that review independently before sending any genuine patient data to any AI provider, Groq included. The provider-abstraction boundary means switching providers later (e.g. for a different model or a stricter data-handling agreement) is a single-file change, not a pipeline redesign.

## ADR-013: Maestro (mobile) + Playwright (admin) for E2E testing

**Context:** [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md) required an E2E tool for each client; the mobile choice (Detox vs. Maestro) was left open in the original specification.

**Decision:** **Maestro** for the Expo/React Native mobile app, **Playwright** for the Next.js admin console — confirmed by the user.

**Consequences:** Maestro's YAML-flow format requires no native build tooling to author/run tests (unlike Detox, which needs a compiled native test runner), which fits an Expo-managed-workflow project ([ADR-004](43-ARCHITECTURE-DECISIONS.md)) better and keeps the local-quality-gate story simple given there's no CI runner to pre-provision with native toolchains. Playwright's choice for admin was never in question (it's the natural fit for a Next.js app) and required no new decision.

## ADR-014: Confirmed scope — learning/demo project, synthetic data only

**Context:** The original specification left the target regulatory posture as the single most important open decision, since it materially affects retention defaults, breach-notification workflow requirements, and third-party data-handling obligations.

**Decision:** This platform is built and operated as a **learning/demonstration project**. Every environment — local, staging, and any deployed "production" instance — uses only synthetic/fixture data (per [36-SEED-DATA.md](36-SEED-DATA.md)); real patient data is never entered into the system, at any stage, in any environment.

**Consequences:** This resolves the regulatory-posture question by removing its premise — there is no real PHI, so no named regulatory framework's conformance is claimed or required, and no Business Associate Agreement-equivalent posture is needed with Groq, Render, Supabase, or Vercel (see [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)). This does **not** relax any engineering practice elsewhere in this specification: authorization, tenant isolation, audit logging, encryption, and every other control in [25-SECURITY.md](25-SECURITY.md) are still fully implemented and tested, because the project's purpose is to demonstrate production-grade healthcare-software engineering — only the data populating it is fictitious. A future real-world deployment would need a fresh, independent regulatory review before accepting genuine patient data; nothing in this specification should be read as having already satisfied that review.
