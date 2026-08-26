import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete-extension";

/**
 * The Prisma Client every app should actually import — pre-wired with the
 * soft-delete read filter. `apps/api` (and any future consumer) should never
 * instantiate a bare `new PrismaClient()` directly; use this factory instead
 * so the soft-delete behavior in docs/13-DATABASE-DESIGN.md is never
 * accidentally bypassed by forgetting to apply the extension.
 */
export function createPrismaClient() {
  return new PrismaClient().$extends(softDeleteExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
