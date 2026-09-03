import { z } from "zod";

/**
 * `/doctors` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/doctors".
 * `POST /doctors` deliberately does not create a `User` — it attaches a
 * clinical profile to a User already invited with the DOCTOR role via
 * `POST /users/invite` (Phase 4), matching "Create (links to invited User)".
 */
export const createDoctorSchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  qualifications: z.string().min(1, "Qualifications are required.").max(500),
  bio: z.string().max(2000).optional(),
  yearsOfExperience: z.number().int().nonnegative().max(80).optional(),
  consultationFee: z.number().nonnegative().max(1_000_000).optional(),
  defaultConsultationDurationMinutes: z.number().int().positive().max(240).optional(),
  photoUrl: z.string().url().optional(),
  // Convenience: assign to one or more Departments in the same call,
  // instead of a separate POST /doctors/:id/departments per department.
  departmentIds: z.array(z.string().uuid()).optional(),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

export const updateDoctorSchema = createDoctorSchema
  .omit({ hospitalId: true, userId: true, departmentIds: true })
  .partial()
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]).optional(),
  });

export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;

export const listDoctorsQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  query: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  // Accepted per docs/15-API-SPECIFICATION.md but not yet filterable —
  // "available today" needs DoctorSchedule (Phase 6). A truthy value is a
  // no-op rather than a rejected request, so an already-built client
  // doesn't break once Phase 6 starts actually honoring it.
  availableToday: z.coerce.boolean().optional(),
});

export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;

export const assignDoctorDepartmentSchema = z.object({
  departmentId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

export type AssignDoctorDepartmentInput = z.infer<typeof assignDoctorDepartmentSchema>;
