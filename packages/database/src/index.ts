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

