import { Prisma } from "@prisma/client";

/**
 * Models with a nullable `deletedAt` column per docs/13-DATABASE-DESIGN.md's
 * soft-delete/audit summary matrix. Kept as a literal list (not derived from
 * DMMF at runtime) so adding a new soft-deletable model is a deliberate,
 * reviewed change here — not something that silently starts/stops being
 * filtered because of an unrelated schema edit.
 */
const SOFT_DELETE_MODELS = new Set([
  "Hospital",
  "Branch",
  "Department",
  "User",
  "Patient",
  "Doctor",
  "Staff",
  "Appointment",
  "Document",
]);

/**
 * Excludes soft-deleted rows (`deletedAt IS NOT NULL`) from list/count/aggregate
 * reads by default, per docs/13-DATABASE-DESIGN.md: "Rows with deletedAt IS NOT
 * NULL are excluded by a default Prisma middleware/repository filter." A caller
 * that genuinely needs to see soft-deleted rows (an admin "show inactive"
 * toggle, an audit-trail lookup) passes `deletedAt` explicitly in its own
 * `where` — this extension only fills the gap when the caller didn't already
 * decide, it never overrides an explicit `deletedAt` condition.
 *
 * Deliberately does NOT touch `findUnique`/`update`/`delete` — those operate
 * on a single already-known row (e.g. rendering the name of a since-deactivated
 * doctor on an old audit log entry), where silently hiding it would be the
 * more surprising behavior. Deleting a soft-deletable row is done by setting
 * `deletedAt` via a normal `update`, never Prisma's `delete` — see
 * docs/44-CODING-STANDARDS.md.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: "soft-delete-read-filter",
  query: {
    $allModels: {
      async findFirst({ model, args, query }) {
        return query(applyFilter(model, args));
      },
      async findMany({ model, args, query }) {
        return query(applyFilter(model, args));
      },
      async count({ model, args, query }) {
        return query(applyFilter(model, args));
      },
      async aggregate({ model, args, query }) {
        return query(applyFilter(model, args));
      },
      async groupBy({ model, args, query }) {
        return query(applyFilter(model, args));
      },
    },
  },
});

/** Exported for unit testing — see soft-delete-extension.spec.ts. */
export function applyFilter<A extends { where?: Record<string, unknown> }>(model: string, args: A): A {
  if (!SOFT_DELETE_MODELS.has(model)) {
    return args;
  }
  if (args.where && Object.prototype.hasOwnProperty.call(args.where, "deletedAt")) {
    return args;
  }
  return { ...args, where: { ...args.where, deletedAt: null } };
}
