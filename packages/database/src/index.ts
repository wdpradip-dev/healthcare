/**
 * Re-exports the generated Prisma Client. `@hospital/database` is the only package
 * allowed to import `@prisma/client` directly (docs/12-MONOREPO-STRUCTURE.md
 * "Dependency direction rules") — apps/api consumes it through repository/service
 * classes added alongside each domain module starting Phase 3.
 */
export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";
export { createPrismaClient, type ExtendedPrismaClient } from "./client";
export { softDeleteExtension } from "./soft-delete-extension";

/**
 * Re-exported so integration tests (apps/api/test/*.integration-spec.ts) can
 * seed the permission/role/medication catalog directly against their test
 * database without shelling out to `pnpm db:seed` first — see
 * docs/36-SEED-DATA.md "Catalog seed" for what this populates.
 */
export { seedCatalog } from "../seed/catalog/index";

