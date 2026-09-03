import { z } from "zod";

/**
 * `/departments` DTO schemas — mirrors docs/15-API-SPECIFICATION.md
 * "/departments". `hospitalId` follows the same Super-Admin-only override
 * rule as `/branches` — see branches.ts.
 */
export const createDepartmentSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  branchId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(200),
  description: z.string().max(2000).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = createDepartmentSchema.omit({ hospitalId: true }).partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const listDepartmentsQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  query: z.string().optional(),
});

export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
