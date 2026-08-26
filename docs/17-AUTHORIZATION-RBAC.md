# 17 — Authorization / RBAC

## Principle

Authorization decisions are made against **permission strings + resolved scope**, never against role names in business logic. `if (user.role === 'ADMIN')` is a banned pattern in code review; the correct form is `if (can(user, 'patients.write', targetPatient))`. This is what allows custom roles (Post-MVP) to work without touching domain code, and it's what makes the permission catalog in [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md) the actual source of truth rather than documentation-only.

## The two-part check

Every protected route declares a required permission via a decorator, e.g. `@RequirePermission('appointments.cancel')`. At request time the `AuthorizationGuard`:

1. **Permission check** — does any of the requester's roles grant this permission at all? Resolved from the JWT's embedded `permissions` claim (fast path) or, when the check needs scope data the token doesn't carry (see below), from a live `RolePermission` query.
2. **Scope check** — for the specific resource(s) the request targets, does the requester's granted scope (`SELF`/`ASSIGNED`/`BRANCH`/`HOSPITAL`/`PLATFORM`) actually cover it? This always hits the database (or the request's own resolved-resource data) because scope is inherently about *this row*, not the role in the abstract.

Both must pass. Failing (1) returns `403 FORBIDDEN`. Failing (2) returns `404 NOT_FOUND` when the failure is a tenant/ownership mismatch (don't confirm the resource exists to an unauthorized party) or `403 FORBIDDEN` when the resource is visibly known to exist but the action on it isn't allowed (e.g. a Doctor viewing another Doctor's own schedule-edit action).

## Scope resolution logic

| Scope | Resolution |
|---|---|
| `SELF` | `resource.patientId === user.patientId` (or equivalent self-reference) |
| `ASSIGNED` | For Doctor: `resource.doctorId === user.doctorId` OR an `Appointment`/`Consultation` links this doctor to this patient. For Nurse: same pattern via appointment assignment within their branch. |
| `BRANCH` | `resource.branchId IN user.assignedBranchIds` |
| `HOSPITAL` | `resource.hospitalId === user.hospitalId` |
| `PLATFORM` | Always passes (Super Admin only; still fully audited per access, see [25-SECURITY.md](25-SECURITY.md) break-glass pattern) |

Scope is resolved server-side from the authenticated user's DB-backed role/assignment records at request time for anything mutating; read-heavy list endpoints apply scope as a query-level filter (e.g. Receptionist's `GET /patients` automatically adds `WHERE branchId IN (:assignedBranches)`) rather than fetching-then-filtering, both for performance and so scope can never be bypassed by pagination tricks.

## Guard implementation shape (NestJS)

```
@RequirePermission('appointments.cancel')
@UseGuards(JwtAuthGuard, AuthorizationGuard)
@Patch(':id/cancel')
cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) { ... }
```

`AuthorizationGuard` is global-registered but **opt-out is forbidden** — every route must declare a permission (including explicitly `@Public()` for the handful of unauthenticated routes), enforced by a lint rule that fails the build if a controller method has neither decorator. This prevents "someone forgot to add the guard" from ever being the root cause of a data leak.

## Multiple roles per user

A `User` can hold more than one `Role` (e.g. a hospital's Medical Director might be both `DOCTOR` and `ADMIN`). Effective permissions are the **union** of all held roles' permissions; scope for a given permission uses the widest scope any held role grants for it. This is a deliberate simplification — MVP does not support "role A only within branch X, role B only within branch Y" split scoping; that's a documented Post-MVP refinement if a real hospital needs it.

## Custom roles (schema-ready, disabled in MVP UI)

`Role.hospitalId` and the full `RolePermission` join already support a hospital defining its own role with a hand-picked permission bundle. MVP ships only the six system roles with `isSystem = true` (immutable); the admin UI for creating custom roles is deliberately not built in Stage 2 MVP scope but nothing in the data model blocks it later — see [40-ROADMAP.md](40-ROADMAP.md) Post-MVP phase.

## Denying by default

Any permission not explicitly granted to a role is denied. There is no "implicit admin" or wildcard permission, including for `SUPER_ADMIN` — `SUPER_ADMIN`'s seed data explicitly grants every catalog permission at `PLATFORM` scope, so the deny-by-default rule has no exceptions in the authorization engine itself (Super Admin's power comes from what's granted, not from bypassing the check).

## Testing requirements

Every permission in the catalog must have at least one automated test asserting: (a) a role that should have it succeeds, (b) a role that shouldn't have it gets `403`, (c) a correctly-permissioned actor targeting another tenant's resource gets `404`. See [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md) and [31-E2E-TEST-CASES.md](31-E2E-TEST-CASES.md) for the authorization test matrix.
