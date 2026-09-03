import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { DomainException } from "@hospital/shared";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "../decorators/rate-limit.decorator";

interface Bucket {
  count: number;
  resetAt: number;
}

/** See docs/common/decorators/rate-limit.decorator.ts for the design tradeoffs. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${request.ip}`;
    const now = Date.now();

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 });
      return true;
    }

    if (existing.count >= options.limit) {
      throw new DomainException("RATE_LIMITED", "Please wait a moment and try again.");
    }

    existing.count += 1;
    return true;
  }
}
