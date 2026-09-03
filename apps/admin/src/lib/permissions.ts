import type { SessionUser } from "./auth-provider";

/** `(permission, scope)` per docs/02-PERSONAS-AND-ROLES.md — the client only
 * ever checks the permission half, to decide what UI to render; every
 * server response is still independently scope-checked by the API. */
export function hasPermission(user: SessionUser | null, permission: string): boolean {
  return user?.permissions.includes(permission) ?? false;
}

/** `SUPER_ADMIN` operates at `PLATFORM` scope (no implicit hospital) — see
 * docs/18-MULTI-TENANCY.md and apps/api/src/common/tenant-scope.util.ts. */
export function isSuperAdmin(user: SessionUser | null): boolean {
  return user?.roles.includes("SUPER_ADMIN") ?? false;
}
