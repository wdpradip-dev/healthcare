# 39 — Production Readiness

## Purpose

The single checklist that gates "can this go live," distinct from the per-feature Implementation Quality Gate (which gates "is this one feature done"). A feature can pass its own quality gate and the platform can still not be production-ready if cross-cutting concerns (backup tested, monitoring wired, security review done) aren't in place.

## Per-feature Definition of Done (recap, enforced continuously through Stage 2 — see the project brief's Implementation Quality Gate)

- [ ] Database migration reviewed (expand/contract discipline where applicable, per [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md))
- [ ] Backend service logic implemented and covered by unit + integration tests
- [ ] API endpoint(s) documented in Swagger, matching [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)
- [ ] Admin UI implemented (where applicable) matching [09-ADMIN-DESIGN-MOCKUPS.md](09-ADMIN-DESIGN-MOCKUPS.md)
- [ ] Mobile UI implemented (where applicable) matching [08-MOBILE-DESIGN-MOCKUPS.md](08-MOBILE-DESIGN-MOCKUPS.md)
- [ ] Validation implemented client + server (shared Zod schema)
- [ ] Authorization implemented and covered by the permission-matrix test pattern ([17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md))
- [ ] Every documented error state ([04-FEATURE-SPECIFICATION.md](04-FEATURE-SPECIFICATION.md)) implemented and tested
- [ ] Loading/empty/error/success states implemented per [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)
- [ ] Audit events implemented for every action listed in the feature's spec
- [ ] Accessibility pass (automated + a manual screen-reader/keyboard check) per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md)
- [ ] TypeScript passes with zero errors across affected packages/apps
- [ ] Lint passes with zero errors
- [ ] All tests pass via the local quality-gate script (`pnpm quality`)
- [ ] [42-PROJECT-STATE.md](42-PROJECT-STATE.md) updated

A feature is never reported complete with any of the above unmet — per the project's governing instructions, claiming completion prematurely is treated as a process failure, not a minor gap.

## Platform-wide launch checklist (beyond any single feature)

### Security
- [ ] Manual security review pass completed (authorization matrix, tenant isolation, auth abuse cases, file-upload handling) — see [25-SECURITY.md](25-SECURITY.md)
- [ ] Dependency vulnerability scan clean (no unresolved high/critical findings)
- [ ] Secrets confirmed absent from source control and container images (scan-verified, not just policy-asserted)
- [ ] `SUPER_ADMIN_BREAK_GLASS_ENABLED` confirmed `false` in production unless explicitly needed
- [ ] TLS/HSTS/CSP headers verified in the actual deployed environment, not just configured in code

### Data & compliance
- [x] Regulatory posture resolved: learning/demo project, synthetic data only, no regulatory framework conformance claimed or required ([26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md), [ADR-014](43-ARCHITECTURE-DECISIONS.md))
- [ ] Confirm no real patient data has been entered into any environment before every "production" smoke test / demo session (a standing check, not a one-time box — see [36-SEED-DATA.md](36-SEED-DATA.md)'s production-guard on demo seeding)
- [ ] Malware-scan hook upgraded from the MVP mock/stub ([21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md)) to a real scanner implementation before the "production" environment goes live — user-confirmed requirement, tracked as Phase 15 task `T-1508` ([41-TASKS.md](41-TASKS.md)), independent of the synthetic-data-only scope decision

### Reliability
- [ ] Backup restore drill performed successfully at least once against a non-production environment ([34-BACKUP-AND-DISASTER-RECOVERY.md](34-BACKUP-AND-DISASTER-RECOVERY.md))
- [ ] Monitoring dashboards and alert routing verified end-to-end (trigger a test alert, confirm it pages)
- [ ] Load/performance smoke test against the P95 targets in [01-PRODUCT-REQUIREMENTS.md](01-PRODUCT-REQUIREMENTS.md)
- [ ] Health check endpoints verified against the actual load balancer configuration

### Product completeness
- [ ] Full E2E suite ([31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md)) passing against Staging
- [ ] Accessibility audit (automated + manual) completed against Staging
- [ ] Seed catalog data (permissions/roles/medications) loaded in production; demo seed confirmed **not** loaded
- [ ] At least one real hospital fully configured end-to-end (branches, departments, doctors, schedules) as the pilot deployment validation

### Operational
- [ ] On-call rotation and incident-response process defined (who gets paged, what the escalation path is) — a process document outside `docs/`, referenced but not owned here
- [ ] Support flow for password reset / account-lock edge cases documented for the hospital's own front-line staff

## Relationship to Stage gates

This document governs the **Stage 2 exit** (production launch readiness). The Stage 1 exit gate is the checklist embedded in the project's governing instructions (documentation completeness) and is tracked as satisfied by this specification's completion, reported in the `STAGE 1 COMPLETE` summary.
