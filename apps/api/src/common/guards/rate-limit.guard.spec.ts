import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { DomainException } from "@hospital/shared";
import { RateLimitGuard } from "./rate-limit.guard";

function makeContext(ip: string, handlerId = 1): ExecutionContext {
  return {
    getHandler: () => ({ __id: handlerId }) as never,
    getClass: () => ({ name: "TestController" }) as never,
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe("RateLimitGuard", () => {
  it("allows requests under the limit and blocks once the limit is exceeded", () => {
    const reflector = { get: () => ({ limit: 3, windowSeconds: 60 }) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const ctx = makeContext("1.2.3.4");

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(DomainException);
  });

  it("tracks separate buckets per client IP", () => {
    const reflector = { get: () => ({ limit: 1, windowSeconds: 60 }) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);

    expect(guard.canActivate(makeContext("1.1.1.1"))).toBe(true);
    expect(guard.canActivate(makeContext("2.2.2.2"))).toBe(true);
    expect(() => guard.canActivate(makeContext("1.1.1.1"))).toThrow(DomainException);
  });

  it("does nothing for a route with no @RateLimit() metadata", () => {
    const reflector = { get: () => undefined } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const ctx = makeContext("9.9.9.9");
    for (let i = 0; i < 20; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });
});
