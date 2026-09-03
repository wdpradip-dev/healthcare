import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { DomainException } from "@hospital/shared";
import type { Permission } from "@hospital/validation";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { REQUIRE_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { IS_AUTHENTICATED_ONLY_KEY } from "../decorators/authenticated.decorator";

/**
 * The permission half of the two-part authorization check
 * (docs/17-AUTHORIZATION-RBAC.md): does any role the caller holds grant the
 * permission this route declares, at all? Scope (does it apply to *this*
 * row) is the domain service's job once resource data exists to check
 * against — this guard cannot know that in general.
 *
 * Fails closed: a route with neither `@Public()` nor `@RequirePermission()`
 * is denied, not silently allowed — this is the runtime backstop behind
 * scripts/check-route-permissions.mjs's build-time check.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isAuthenticatedOnly = this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermission && !isAuthenticatedOnly) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} has none of @Public(), ` +
          "@Authenticated(), or @RequirePermission() — denying by default. This should have been " +
          "caught by scripts/check-route-permissions.mjs; fix the route.",
      );
      throw new DomainException("FORBIDDEN", "This action is not permitted.");
    }

    if (!requiredPermission) {
      // isAuthenticatedOnly must be true here (the earlier guard clause ruled out
      // "neither"): JwtAuthGuard already confirmed the token is valid, nothing more to check.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const permissions = request.user?.permissions ?? [];

    if (!permissions.includes(requiredPermission)) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }

    return true;
  }
}
