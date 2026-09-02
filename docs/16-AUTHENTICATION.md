# 16 — Authentication

## Strategy

Email/phone + password primary credential, OTP-verified registration and password reset, JWT access tokens + rotating refresh tokens for session continuity. No third-party social login in MVP (a hospital's patient base skews toward direct registration; social login is a Post-MVP addition, not a security-relevant omission).

## Password policy

- Minimum 8 characters, at least 1 uppercase letter, 1 number (documented client-side hint; enforced server-side as the source of truth).
- Hashed with **argon2id** (memory cost tuned per [25-SECURITY.md](25-SECURITY.md)); bcrypt (cost ≥ 12) is the documented fallback only if the deployment environment cannot run argon2id natively.
- No maximum length restriction beyond a sane upper bound (128 chars) to avoid rejecting passphrases.
- Password history not enforced in MVP (Post-MVP: prevent reuse of last 5).

## OTP

- 6-digit numeric, single-use, 5-minute TTL.
- Max 5 verification attempts per challenge; exceeding invalidates the challenge (`AUTH_OTP_MAX_ATTEMPTS`) and a new one must be requested.
- Resend cooldown 30 seconds; max 5 resends per identifier per hour (prevents SMS/email bombing).
- Delivered via the same provider abstraction as notifications ([22-NOTIFICATIONS.md](22-NOTIFICATIONS.md)) but as a transactional send that bypasses user notification preferences.
- Stored as `codeHash` (hashed, never plaintext) in `OtpChallenge`.

## Tokens

| Token | Format | TTL | Storage (client) | Storage (server) |
|---|---|---|---|---|
| Access token | JWT (RS256) | 15 minutes | Memory (mobile: SecureStore-backed memory cache; admin: memory only, never localStorage) | Not persisted (stateless, verified via signature) |
| Refresh token | Opaque random string | 30 days (Patient) / 7 days (staff/doctor/admin) | Mobile: Expo SecureStore; Admin: `httpOnly`, `Secure`, `SameSite=Strict` cookie | `RefreshToken.tokenHash` (hashed) |

**Access token claims:** `sub` (userId), `hospitalId` (nullable), `roles` (role keys), `permissions` (resolved permission keys — see note below), `iat`, `exp`, `jti`.

Permissions are embedded in the access token at issuance for fast in-process authorization checks without a DB round-trip per request, **but** the authorization guard always re-validates tenant/scope against live DB state for the specific resource being accessed (embedded permissions answer "can this role ever do X," not "does this row belong to this actor") — see [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md). A role/permission change takes effect on next token refresh (≤15 min), or immediately if the change also revokes sessions (e.g. deactivation).

**Refresh token rotation:** every use issues a new refresh token and invalidates the old one, both linked by `familyId`. If a token is presented after it has already been rotated (`isUsed = true`), the entire family is revoked immediately and the owning user's other sessions are flagged for review — this is the standard reuse-detection defense against stolen refresh tokens. Logged as `AUTH_REFRESH_REUSE_DETECTED` (high-severity audit event) and triggers a security-alert notification to the user.

## Login flow

1. `POST /auth/login` with identifier + password.
2. Server looks up `User` by email/phone; generic `AUTH_INVALID_CREDENTIALS` on no-match or password-mismatch (no enumeration signal).
3. Check `status`: `PENDING_ACTIVATION` → reject with `AUTH_ACCOUNT_PENDING_ACTIVATION` (a distinct guidance message, not a security-sensitive distinction, since the user knows they haven't activated yet); `LOCKED` → `AUTH_ACCOUNT_LOCKED` with unlock time; `DISABLED` → `AUTH_ACCOUNT_DISABLED`.
4. On success: reset `failedLoginAttempts`, create `DeviceSession`, issue token pair, log `AUTH_LOGIN`.
5. On failure: increment `failedLoginAttempts`; at 5 within a rolling 15-minute window, set `lockedUntil = now + 15m` and status effectively locked.

## Session management

- A user may hold multiple concurrent `DeviceSession`s (e.g. phone + tablet).
- Settings → Active Sessions (mobile) lists sessions with device/platform/last-active, and lets the user revoke any but the current one.
- Admin can force-revoke any staff session (`users.manage`); Super Admin can force-revoke any session platform-wide, audited as `AUTH_FORCE_LOGOUT`.
- Logout revokes only the current device's `DeviceSession`/`RefreshToken` family; it never revokes other devices.

## New-device / security alerts

A login from a `DeviceSession` with no prior history for that user triggers a "New sign-in to your account" email (always sent, not preference-gated) with device/location(IP-derived, coarse)/time, and a "This wasn't me" link that routes to forced password reset + full session revocation.

## Staff activation (distinct from Patient self-registration)

Doctors/Nurses/Receptionists/Admins never self-register. An Admin invite (`POST /users/invite`) creates a `PENDING_ACTIVATION` user and emails a signed, time-limited (72h) activation link. The link routes to `POST /users/activate` where the invitee sets their password (OTP-verified against their email as a second factor of "this is really the invited person"). Expired links require the Admin to re-invite.

## Logout & revocation cascade

Events that revoke **all** of a user's sessions immediately: password reset/change, account deactivation, refresh-token-reuse detection, Admin/Super Admin force-logout. Events that revoke **only the current** session: user-initiated logout, access-token natural expiry (session simply lapses, no action needed).
