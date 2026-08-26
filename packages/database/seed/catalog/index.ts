import type { PrismaClient } from "@prisma/client";
import { PERMISSION_SEEDS } from "./permissions";
import { ROLE_GRANTS, SYSTEM_ROLE_KEYS } from "./roles";
import { MEDICATION_SEEDS } from "./medications";
import type { Permission } from "@hospital/validation";

/**
 * Catalog seed: permissions, system roles, role-permission grants, medication
 * formulary. Safe to run in every environment, including "production" (it never
 * creates hospitals/patients/appointments — see seed/demo for that, which is
 * guarded separately). Idempotent: upserts everything, safe to re-run.
 * See docs/36-SEED-DATA.md "Catalog seed".
 */
export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  console.log("[seed:catalog] Seeding permissions...");
  const permissionIdByKey = new Map<Permission, string>();

  for (const seed of PERMISSION_SEEDS) {
    const permission = await prisma.permission.upsert({
      where: { key: seed.key },
      create: seed,
      update: { resource: seed.resource, action: seed.action, description: seed.description },
    });
    permissionIdByKey.set(seed.key, permission.id);
  }
  console.log(`[seed:catalog] ${PERMISSION_SEEDS.length} permissions seeded.`);

  console.log("[seed:catalog] Seeding system roles...");
  for (const roleKey of SYSTEM_ROLE_KEYS) {
    // System roles have hospitalId = null, and Postgres unique constraints treat
    // every NULL as distinct — a compound-unique upsert `where` can't reliably
    // target "the one system role with this key" the way it can for a
    // hospital-scoped custom role, so we look it up by the partial unique index
    // (roles_system_key_active_key, see the migration) via a plain query instead.
    const existingRole = await prisma.role.findFirst({
      where: { hospitalId: null, key: roleKey },
    });
    const role = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: { name: roleKey, isSystem: true },
        })
      : await prisma.role.create({
          data: { key: roleKey, name: roleKey, isSystem: true, hospitalId: null },
        });

    const grants =
      roleKey === "SUPER_ADMIN"
        ? PERMISSION_SEEDS.map((p) => ({ permission: p.key, scope: "PLATFORM" as const }))
        : ROLE_GRANTS[roleKey];

    for (const grant of grants) {
      const permissionId = permissionIdByKey.get(grant.permission);
      if (!permissionId) {
        throw new Error(
          `[seed:catalog] Role ${roleKey} references unknown permission "${grant.permission}" — check docs/02-PERSONAS-AND-ROLES.md.`,
        );
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId, scope: grant.scope },
        update: { scope: grant.scope },
      });
    }
    console.log(`[seed:catalog]   ${roleKey}: ${grants.length} permission grants.`);
  }

  console.log("[seed:catalog] Seeding medication formulary...");
  for (const med of MEDICATION_SEEDS) {
    const existing = await prisma.medication.findFirst({ where: { name: med.name } });
    if (existing) {
      await prisma.medication.update({
        where: { id: existing.id },
        data: { genericName: med.genericName, form: med.form, strength: med.strength, isActive: true },
      });
    } else {
      await prisma.medication.create({
        data: {
          name: med.name,
          genericName: med.genericName,
          form: med.form,
          strength: med.strength,
        },
      });
    }
  }
  console.log(`[seed:catalog] ${MEDICATION_SEEDS.length} medications seeded.`);
}
