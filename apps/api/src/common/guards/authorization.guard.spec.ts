import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { DomainException } from "@hospital/shared";
import { AuthorizationGuard } from "./authorization.guard";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { IS_AUTHENTICATED_ONLY_KEY } from "../decorators/authenticated.decorator";
import { REQUIRE_PERMISSION_KEY } from "../decorators/require-permission.decorator";

function makeContext(user: { permissions: string[] } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({ name: "TestController" }) as never,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("AuthorizationGuard", () => {
  let reflector: Reflector;
  let guard: AuthorizationGuard;
  let metadata: Record<string, unknown>;

  beforeEach(() => {
    metadata = {};
    reflector = {
      getAllAndOverride: (key: string) => metadata[key],
    } as unknown as Reflector;
    guard = new AuthorizationGuard(reflector);
  });

  it("allows a @Public() route with no user at all", () => {
    metadata[IS_PUBLIC_KEY] = true;
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it("allows an @Authenticated() route regardless of permissions", () => {
    metadata[IS_AUTHENTICATED_ONLY_KEY] = true;
    expect(guard.canActivate(makeContext({ permissions: [] }))).toBe(true);
  });

  it("allows a @RequirePermission() route when the user holds that permission", () => {
    metadata[REQUIRE_PERMISSION_KEY] = "patients.read";
    expect(guard.canActivate(makeContext({ permissions: ["patients.read", "appointments.read"] }))).toBe(true);
  });

  it("denies a @RequirePermission() route when the user lacks that permission", () => {
    metadata[REQUIRE_PERMISSION_KEY] = "patients.write";
    expect(() => guard.canActivate(makeContext({ permissions: ["patients.read"] }))).toThrow(DomainException);
  });

  it("fails closed when a route has neither @Public(), @Authenticated(), nor @RequirePermission()", () => {
    expect(() => guard.canActivate(makeContext({ permissions: ["patients.read"] }))).toThrow(DomainException);
  });

  it("denies a @RequirePermission() route when there is no authenticated user", () => {
    metadata[REQUIRE_PERMISSION_KEY] = "patients.read";
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(DomainException);
  });
});
