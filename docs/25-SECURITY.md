# 25 — Security

## Threat model summary

| Threat | Mitigation |
|---|---|
| Credential stuffing / brute force | Account lockout after 5 failed attempts/15min ([16-AUTHENTICATION.md](16-AUTHENTICATION.md)); rate limiting on `/auth/*`; argon2id hashing makes offline cracking of a leaked hash expensive |
| Stolen/replayed refresh token | Rotation + reuse detection revokes the full token family, alerts the user ([16-AUTHENTICATION.md](16-AUTHENTICATION.md)) |
| Cross-tenant data leakage | Defense-in-depth per [18-MULTI-TENANCY.md](18-MULTI-TENANCY.md): JWT-derived `hospitalId`, repository-layer scoping, guard-layer re-verification, DB constraint backstop, dedicated isolation tests |
| Privilege escalation via role tampering | Permissions are server-resolved and embedded in a signed JWT (RS256) the client cannot forge; role/permission changes re-validated against live DB in the scope check, not just the token, for any resource-specific action |
| Broken object-level authorization (IDOR) | Every resource-by-id lookup is scope-checked against the actor, not just permission-checked in the abstract ([17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md)); cross-tenant/unauthorized lookups return `404`, not a data-confirming `403` |
| SQL injection | Prisma parameterized queries exclusively; no raw string-concatenated SQL anywhere in the codebase (lint-enforced ban on `$queryRawUnsafe`) |
| XSS | React/React Native's default escaping; admin console applies a strict Content-Security-Policy; rich-text clinical notes are sanitized server-side on write (allow-listed formatting tags only) and rendered via a sanitizing renderer, never `dangerouslySetInnerHTML` on raw stored content |
| CSRF | Admin auth cookie is `SameSite=Strict` + `httpOnly`; state-changing requests additionally require the `Authorization` header pattern (bearer token in a header is not automatically sent cross-site the way a cookie is), so CSRF is structurally difficult even before considering same-site cookie policy |
| File-upload attacks (malicious file masquerading as report) | Magic-byte MIME verification, size limits, malware-scan hook, storage outside the web root with no execute permissions, signed time-limited access URLs only ([21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md)) |
| Enumeration (does this email exist?) | Identical responses for login/forgot-password regardless of account existence |
| Denial of service on booking (slot-hoarding bots) | Rate limiting on `POST /appointments`; CAPTCHA/bot-detection considered Post-MVP if abuse is observed in practice |
| Man-in-the-middle | TLS 1.2+ enforced end-to-end, HSTS on the admin console, certificate pinning considered Post-MVP for mobile |
| Insider misuse of broad access (Super Admin) | Break-glass pattern below: mandatory reason code + full audit trail on every cross-tenant/clinical-write action |

## Authentication & session security

Fully specified in [16-AUTHENTICATION.md](16-AUTHENTICATION.md): argon2id hashing, 15-minute access tokens, rotating one-time-use refresh tokens with reuse detection, OTP-gated registration/reset, per-device session tracking and revocation.

## Authorization

Fully specified in [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md): permission-string + scope model, deny-by-default, mandatory guard on every route (lint-enforced).

## Rate limiting

| Endpoint class | Limit |
|---|---|
| `/auth/login` | 5 requests / 5 min / IP, plus the account-level 5/15min lockout |
| `/auth/register`, `/auth/forgot-password` | 5 requests / hour / IP |
| `/auth/*-otp` | 5 requests / hour / identifier (see OTP policy in [16-AUTHENTICATION.md](16-AUTHENTICATION.md)) |
| `POST /appointments` | 20 requests / min / user (generous for legitimate use, blocks scripted slot-hoarding) |
| All other authenticated endpoints | 100 requests / min / user (global backstop) |

Enforced at two layers: edge load balancer (coarse, IP-based, defense against volumetric abuse) and application middleware (fine-grained, user/identifier-based, aware of authentication state) — see [11-SYSTEM-ARCHITECTURE.md](11-SYSTEM-ARCHITECTURE.md).

## Secure headers & CORS

- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (admin console must never be iframe-embeddable), `Content-Security-Policy` (admin — script-src self + trusted CDN-free inline-free policy), `Referrer-Policy: strict-origin-when-cross-origin`.
- CORS: API allow-lists exactly the deployed admin origin(s) and the mobile app's dev/prod API base URLs; no wildcard `*` origin in any environment, including staging.

## Input validation

Every request body validated against a Zod schema (`packages/validation`) before any handler logic runs; failures short-circuit to `400 VALIDATION_ERROR` before touching the database. Path/query params are similarly validated (type, range, allow-listed enum values) — an unrecognized `status` filter value is a validation error, not silently ignored, to avoid a client "silently getting more data than intended" failure mode.

## Secure file access

Covered in depth in [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md): private object storage, signed short-lived URLs generated per-request after a permission check, no public buckets, magic-byte MIME verification, pluggable malware scanning.

## Secrets management

- No secrets in source control (enforced via `.env.example` containing only placeholder keys, real `.env` files gitignored, and a pre-commit secret-scanning hook).
- Production secrets (DB credentials, JWT signing keys, provider API keys) live in the deployment platform's secret manager (see [32-DEPLOYMENT.md](32-DEPLOYMENT.md) / [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md)), injected as environment variables at runtime, never baked into container images.
- JWT signing uses an asymmetric key pair (RS256); the private key exists only in the API's runtime environment, never distributed to clients — the public key alone would be needed for any external verification, which no other current service performs.

## Encryption

- **In transit:** TLS 1.2+ everywhere (client↔API, API↔database, API↔object storage, API↔third-party providers).
- **At rest:** managed PostgreSQL and object storage's native at-rest encryption (provider-level, e.g. AES-256) — see [32-DEPLOYMENT.md](32-DEPLOYMENT.md) for the specific managed services assumed.
- **Application-level field encryption** for an especially sensitive subset (e.g. `Patient.emergencyContactPhone`, government-ID document contents) is a documented Post-MVP hardening step, not required for MVP given provider-level at-rest encryption is already in place; flagged as an open decision if the target deployment's compliance posture requires it sooner.

## Break-glass access (Super Admin)

`SUPER_ADMIN` clinical-content read/write at `PLATFORM` scope is technically possible (the permission catalog grants it) but is treated as an exceptional support path, not routine tooling: every such access requires a `reasonCode` parameter, is logged with high-severity audit metadata, and — for clinical *writes* specifically — is disabled by a feature flag that defaults off in production, requiring explicit, separately-audited activation. This is documented here rather than left implicit because "the platform operator can technically see/edit everything" is exactly the kind of capability that needs an explicit, narrow, logged pathway rather than silent availability.

## Dependency & build security

- Dependency vulnerability scanning (`pnpm audit`/equivalent) run as part of the local quality-gate script ([30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)), blocking a deploy on high/critical findings — there is no hosted CI to run this automatically, so it's a required manual step before every deploy per [32-DEPLOYMENT.md](32-DEPLOYMENT.md).
- Lockfiles committed (`pnpm-lock.yaml`); no floating version ranges for security-sensitive packages (auth, crypto).

## Security testing

Full detail in [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md) and [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md): authorization matrix tests, tenant-isolation tests, auth flow abuse-case tests (lockout, OTP exhaustion, token reuse), and a pre-launch checklist item in [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md) for a manual security review pass (the `security-review` workflow available in this environment is the intended mechanism for that pass once Stage 2 code exists).
