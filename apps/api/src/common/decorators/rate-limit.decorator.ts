import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

/**
 * Declares a rate limit for a route, enforced by RateLimitGuard — see
 * docs/25-SECURITY.md "Rate limiting". Keyed by client IP + route (a
 * simplification versus the doc's per-identifier limiting; account lockout,
 * which *is* per-identifier and DB-backed, is the primary defense against
 * credential stuffing on login specifically — this guard is a coarser,
 * IP-based backstop across all sensitive endpoints).
 *
 * In-memory by default (single-instance), matching docs/33-ENVIRONMENT-VARIABLES.md's
 * "local dev may use an in-memory limiter instead." A Redis-backed
 * implementation for horizontally-scaled deployments is a documented
 * Phase 10/15 upgrade, not required for this project's confirmed scope.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
