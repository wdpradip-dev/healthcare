import type { Permission, SystemRole } from "@hospital/validation";

/**
 * The authenticated actor, resolved from the access token's claims by
 * JwtAuthGuard and attached to `request.user`. Mirrors the JWT payload shape
 * documented in docs/16-AUTHENTICATION.md ("Access token claims").
 */
export interface RequestUser {
  /** User.id */
  sub: string;
  hospitalId: string | null;
  roles: SystemRole[];
  permissions: Permission[];
  /** JWT id — used to correlate with audit/security events. */
  jti: string;
}

declare module "express" {
  interface Request {
    user?: RequestUser;
  }
}
