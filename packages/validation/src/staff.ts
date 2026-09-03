import { z } from "zod";

/**
 * `/staff` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/staff".
 * There is no `POST /staff`: a staff profile is created implicitly by
 * `POST /users/invite` (Phase 4) for NURSE/RECEPTIONIST roles. This file
 * only covers list/update, matching the documented route table.
 */
export const updateStaffSchema = z.object({
  jobTitle: z.string().max(200).optional(),
  branchId: z.string().uuid().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const listStaffQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  query: z.string().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
