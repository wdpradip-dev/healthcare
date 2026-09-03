import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { hashPassword } from "@hospital/shared";
import { AccessTokenService } from "../src/common/jwt/access-token.service";
import { AuthzResolverService } from "../src/auth/authz-resolver.service";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * Test-only fixture builders for the Phase 4 domain modules (Hospital,
 * Branch, Department, User) — creates rows directly via Prisma (bypassing
 * the invite/activation HTTP flow, already covered by its own tests) and
 * signs a real access token via the same `AccessTokenService`/
 * `AuthzResolverService` the real login flow uses, so a fixture's token is
 * exactly as authentic as one issued by `POST /auth/login`.
 */
export async function createHospital(prisma: PrismaService, overrides: Partial<{ name: string; slug: string }> = {}) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.client.hospital.create({
    data: {
      name: overrides.name ?? `Test Hospital ${suffix}`,
      slug: overrides.slug ?? `test-hospital-${suffix}`,
      contactEmail: `contact-${suffix}@example.test`,
      contactPhone: "+15550000000",
    },
  });
}

export async function createStaffUser(
  prisma: PrismaService,
  params: { hospitalId: string | null; roleKey: "ADMIN" | "SUPER_ADMIN" | "NURSE" | "RECEPTIONIST" | "DOCTOR" },
) {
  const suffix = randomUUID().slice(0, 8);
  const role = await prisma.client.role.findFirstOrThrow({ where: { hospitalId: null, key: params.roleKey } });
  const passwordHash = await hashPassword("Password1");
  const user = await prisma.client.user.create({
    data: {
      hospitalId: params.hospitalId,
      name: `Test ${params.roleKey} ${suffix}`,
      email: `${params.roleKey.toLowerCase()}-${suffix}@example.test`,
      passwordHash,
      status: "ACTIVE",
      userRoles: { create: { roleId: role.id } },
    },
  });
  return user;
}

export async function signAccessTokenForUser(app: INestApplication, userId: string): Promise<string> {
  const authzResolver = app.get(AuthzResolverService);
  const accessTokenService = app.get(AccessTokenService);
  const authz = await authzResolver.resolve(userId);
  return accessTokenService.sign({
    sub: userId,
    hospitalId: authz.hospitalId,
    roles: authz.roles,
    permissions: authz.permissions,
  });
}
