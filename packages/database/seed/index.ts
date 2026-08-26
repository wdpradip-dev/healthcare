import { PrismaClient } from "@prisma/client";
import { seedCatalog } from "./catalog";
import { seedDemo } from "./demo";

/**
 * Seed entrypoint. Always runs the catalog seed (permissions, roles,
 * role-permissions, medications — safe in every environment, including
 * "production"). Additionally runs the demo seed (fixture hospitals, doctors,
 * patients, appointments, ...) UNLESS NODE_ENV=production — this guard is the
 * single most important line in this file; do not remove it. See
 * docs/36-SEED-DATA.md "Seed data safety rule".
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await seedCatalog(prisma);

    if (process.env.NODE_ENV === "production") {
      console.log(
        "[seed] NODE_ENV=production — skipping demo seed (fixture hospitals/patients/appointments). " +
          "This project never runs demo data in production; see docs/36-SEED-DATA.md.",
      );
      return;
    }

    await seedDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
