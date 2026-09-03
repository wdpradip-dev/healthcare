import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthorizationGuard } from "./guards/authorization.guard";
import { RateLimitGuard } from "./guards/rate-limit.guard";
import { NoopRateLimitGuard } from "./guards/noop-rate-limit.guard";
import { GlobalExceptionFilter } from "./filters/global-exception.filter";

/**
 * Registers the global guard chain (order matters: rate limiting resolves
 * before any auth work; JWT auth resolves `request.user` before
 * AuthorizationGuard checks permissions against it) and the global
 * exception filter. Every route in the application goes through this chain
 * — see docs/17-AUTHORIZATION-RBAC.md.
 *
 * The rate-limit guard is swapped for a no-op under `NODE_ENV=test` — see
 * NoopRateLimitGuard's docstring for why this lives here (module-level
 * registration) rather than as a check inside RateLimitGuard itself: Nest's
 * `overrideGuard()` testing helper only intercepts guards bound via
 * `@UseGuards()`, not ones registered through the `APP_GUARD` multi-provider
 * token the way this module's guards are, so overriding at the module
 * registration point is the mechanism that actually works for a global guard.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: process.env.NODE_ENV === "test" ? NoopRateLimitGuard : RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class CommonModule {}
