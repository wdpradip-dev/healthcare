import { SetMetadata } from "@nestjs/common";

export const IS_AUTHENTICATED_ONLY_KEY = "isAuthenticatedOnly";

/**
 * Marks a route as requiring a valid session but no specific permission from
 * the catalog in docs/02-PERSONAS-AND-ROLES.md — for inherently
 * self-scoped actions (view my own profile, list my own sessions, log
 * myself out) where "is this a valid, logged-in user" is the entire check.
 * This is the third option alongside `@Public()` and `@RequirePermission()`;
 * every controller method must have exactly one of the three — see
 * scripts/check-route-permissions.mjs.
 */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_ONLY_KEY, true);
