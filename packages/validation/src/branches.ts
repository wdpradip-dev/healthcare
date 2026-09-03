import { z } from "zod";

const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be 24h HH:MM, e.g. 09:00.");

const dayHours = z.object({ open: HHMM, close: HHMM });

/** `{ day: { open, close } }`, missing day = closed — docs/13-DATABASE-DESIGN.md "Branch". */
export const operatingHoursSchema = z
  .object({
    monday: dayHours.optional(),
    tuesday: dayHours.optional(),
    wednesday: dayHours.optional(),
    thursday: dayHours.optional(),
    friday: dayHours.optional(),
    saturday: dayHours.optional(),
    sunday: dayHours.optional(),
  })
  .strict();

export type OperatingHours = z.infer<typeof operatingHoursSchema>;

/**
 * `/branches` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/branches".
 * `hospitalId` is accepted here only for a Super Admin caller (Admin's own
 * `hospitalId` from their JWT always wins server-side — see
 * docs/18-MULTI-TENANCY.md point 3, "never a client-supplied header/param").
 */
export const createBranchSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required.").max(200),
  address: z.string().min(1).max(300),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  contactPhone: z.string().min(7).max(20),
  operatingHours: operatingHoursSchema,
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.omit({ hospitalId: true }).partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const listBranchesQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — ignored for an
  // Admin, whose own hospital always wins server-side. See
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  query: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;
