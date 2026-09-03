import { CanActivate, Injectable } from "@nestjs/common";

/**
 * Stand-in for RateLimitGuard used only when `NODE_ENV=test` (see
 * CommonModule) — rate limiting is an anti-abuse production concern, not
 * something that should throttle automated tests exercising the same
 * endpoint many times in a compressed window from one IP
 * (docs/30-TESTING-STRATEGY.md). RateLimitGuard's own correctness is still
 * fully covered by rate-limit.guard.spec.ts, which instantiates and tests
 * the real class directly, independent of this module-level swap.
 */
@Injectable()
export class NoopRateLimitGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
