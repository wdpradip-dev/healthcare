import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@hospital/shared";

/**
 * Creates the platform's one SUPER_ADMIN user, per docs/36-SEED-DATA.md
 * "Catalog seed" — deliberately NOT part of the automatic catalog/demo seed
 * scripts, and deliberately NOT a hardcoded default credential (see
 * docs/25-SECURITY.md). Run explicitly, once, per environment:
 *
 *   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='...' pnpm --filter @hospital/database db:bootstrap-super-admin
 *
 * Idempotent: if a SUPER_ADMIN user already exists, this does nothing rather
 * than creating a second one or silently resetting the existing password.
 */
async function main(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables are both required. " +
        "This script never falls back to a default credential — see docs/25-SECURITY.md.",
    );
  }
  if (password.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters (docs/16-AUTHENTICATION.md policy).");
  }

  const prisma = new PrismaClient();

  try {
    const superAdminRole = await prisma.role.findFirst({
      where: { hospitalId: null, key: "SUPER_ADMIN" },
    });
    if (!superAdminRole) {
      throw new Error(
        "SUPER_ADMIN role not found — run the catalog seed first: pnpm --filter @hospital/database db:seed",
      );
    }

    const existingSuperAdmin = await prisma.userRole.findFirst({
      where: { roleId: superAdminRole.id },
    });
    if (existingSuperAdmin) {
      console.log("[bootstrap-super-admin] A SUPER_ADMIN user already exists — nothing to do.");
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        status: "ACTIVE",
        hospitalId: null,
        userRoles: {
          create: { roleId: superAdminRole.id },
        },
      },
    });

    console.log(`[bootstrap-super-admin] Created SUPER_ADMIN user ${user.email} (${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
