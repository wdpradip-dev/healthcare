import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { DomainException } from "@hospital/shared";
import { AccessTokenService } from "../jwt/access-token.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * decoded `RequestUser` to the request, per docs/16-AUTHENTICATION.md.
 * Routes marked `@Public()` skip this entirely. Runs before
 * AuthorizationGuard in the guard chain (registered first in main.ts).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokenService: AccessTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new DomainException("AUTH_SESSION_EXPIRED", "Authentication required.");
    }

    const token = authHeader.slice("Bearer ".length);
    try {
      request.user = this.accessTokenService.verify(token);
    } catch {
      throw new DomainException("AUTH_SESSION_EXPIRED", "Your session has expired. Please log in again.");
    }

    return true;
  }
}
