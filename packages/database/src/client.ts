import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete-extension";

/**
 * The Prisma Client every app should actually import — pre-wired with the
 * soft-delete read filter. `apps/api` (and any future consumer) should never
 * instantiate a bare `new PrismaClient()` directly; use this factory instead
 * so the soft-delete behavior in docs/13-DATABASE-DESIGN.md is never
 * accidentally bypassed by forgetting to apply the extension.
 *
 * `omit: { user: { passwordHash: true } }` is a defense-in-depth default:
 * `User` is included wholesale (`include: { user: true }`) by several
 * read paths (Doctors/Patients/Staff/Users list & detail), and there is no
 * reason any HTTP response should ever carry an argon2 hash to a client,
 * even hashed. The one legitimate read — `AuthService.login()`'s password
 * check — explicitly opts back in per-query with `omit: { passwordHash: false }`;
 * every write path (`user.create`/`user.update`) is unaffected, since `omit`
 * only ever governs what a read returns.
 */
export function createPrismaClient() {
  return new PrismaClient({ omit: { user: { passwordHash: true } } }).$extends(softDeleteExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
