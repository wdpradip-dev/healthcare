import { z } from "zod";

/**
 * `/hospitals` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/hospitals"
 * and docs/13-DATABASE-DESIGN.md's `Hospital` entity. Super Admin only.
 */
export const createHospitalSchema = z.object({
  name: z.string().min(1, "Name is required.").max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only."),
  logoUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color, e.g. #0F6E63.")
    .optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7).max(20),
});

export type CreateHospitalInput = z.infer<typeof createHospitalSchema>;

export const updateHospitalSchema = createHospitalSchema.partial().extend({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export type UpdateHospitalInput = z.infer<typeof updateHospitalSchema>;

export const listHospitalsQuerySchema = z.object({
  query: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export type ListHospitalsQuery = z.infer<typeof listHospitalsQuerySchema>;
