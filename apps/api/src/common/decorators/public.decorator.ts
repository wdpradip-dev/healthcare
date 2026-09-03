import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as not requiring authentication. Every controller method
 * must have exactly one of `@Public()` or `@RequirePermission(...)` — see
 * docs/17-AUTHORIZATION-RBAC.md and scripts/check-route-permissions.mjs
 * (which enforces this statically, run via `pnpm --filter api lint`).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
