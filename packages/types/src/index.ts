/**
 * Shared TypeScript types, inferred from `@hospital/validation`'s Zod schemas
 * (the source of truth — see docs/12-MONOREPO-STRUCTURE.md "Code generation flow").
 *
 * Re-exports the permission/role/pagination types now that `@hospital/validation`
 * has them. Entity/DTO types are added alongside their corresponding domain module
 * starting Phase 3 (docs/40-ROADMAP.md) as each one gets a real Zod schema to infer from.
 */
export type {
  Permission,
  PermissionScope,
  SystemRole,
  PaginationQuery,
  PaginationMeta,
  ErrorResponse,
} from "@hospital/validation";
