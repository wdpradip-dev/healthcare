import { z } from "zod";

/**
 * `/patients` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/patients".
 * `hospitalId`/`branchId` on registration follow the same Super-Admin-only
 * override rule as branches.ts/departments.ts — see
 * apps/api/src/common/tenant-scope.util.ts. Once registered, a patient's
 * `registeredHospitalId`/`registeredBranchId` are not editable via PATCH —
 * see docs/18-MULTI-TENANCY.md's note on why that pair exists at all.
 */
const identifierRefinement = <T extends { email?: string; phone?: string }>(data: T, ctx: z.RefinementCtx) => {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of email or phone is required.",
      path: ["email"],
    });
  }
};

const demographicsFields = {
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"]).optional(),
  bloodGroup: z.string().max(10).optional(),
  addressLine1: z.string().max(300).optional(),
  addressLine2: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
};

export const registerPatientSchema = z
  .object({
    hospitalId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    name: z.string().min(1, "Name is required.").max(200),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    ...demographicsFields,
  })
  .superRefine(identifierRefinement);

export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

export const updatePatientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(7).max(20).optional(),
  ...demographicsFields,
});

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const listPatientsQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  query: z.string().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(["PENDING_ACTIVATION", "ACTIVE", "LOCKED", "DISABLED"]).optional(),
});

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
