import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@hospital/validation";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

/**
 * Declares the permission a route requires — checked by AuthorizationGuard
 * against the caller's JWT-embedded permission set (docs/17-AUTHORIZATION-RBAC.md
 * "The two-part check"). Scope (SELF/ASSIGNED/BRANCH/HOSPITAL/PLATFORM) is
 * enforced by the domain service itself once resource data exists to scope
 * against — this decorator only carries the permission-string half.
 */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
