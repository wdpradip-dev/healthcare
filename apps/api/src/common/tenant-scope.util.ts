import { DomainException } from "@hospital/shared";
import type { RequestUser } from "./types/request-user";

/**
 * Resolves the tenant a request operates against, per docs/18-MULTI-TENANCY.md
 * point 3: an Admin's own `hospitalId` (from their JWT, never a client-supplied
 * value) always wins. A Super Admin has no implicit hospital (`hospitalId` is
 * `null` on their own token, `PLATFORM` scope) and must name one explicitly —
 * e.g. via the admin console's Hospital switcher — or the request is rejected
 * rather than silently defaulting to "every hospital."
 *
 * Used for both writes (a client-supplied `hospitalId` in the body) and reads
 * (a `hospitalId` query param) — same resolution rule either way.
 */
export function resolveHospitalId(actor: RequestUser, suppliedHospitalId?: string): string {
  if (actor.hospitalId) {
    return actor.hospitalId;
  }
  if (suppliedHospitalId) {
    return suppliedHospitalId;
  }
  throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
    { field: "hospitalId", message: "hospitalId is required for a platform-level actor." },
  ]);
}
