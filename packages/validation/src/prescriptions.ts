import { z } from "zod";

/** `/prescriptions` and `/medications` DTOs — docs/15-API-SPECIFICATION.md. */

export const prescriptionItemSchema = z
  .object({
    /** A formulary medication; exactly one of this or `freeTextName`. */
    medicationId: z.string().uuid().optional(),
    freeTextName: z.string().min(1).max(200).optional(),
    dosage: z.string().min(1, "Dosage is required.").max(100),
    frequency: z.string().min(1, "Frequency is required.").max(100),
    durationDays: z.number().int().min(1).max(365).optional(),
    instructions: z.string().max(500).optional(),
    quantity: z.string().max(50).optional(),
  })
  .refine((item) => (item.medicationId === undefined) !== (item.freeTextName === undefined), {
    message: "Provide either a formulary medication or a free-text name, not both.",
    path: ["medicationId"],
  });

export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;

/**
 * Prescriptions are immutable once issued (docs/13): a correction is a *new*
 * prescription whose `supersedesId` names the one it replaces — there is no
 * update route.
 */
export const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid(),
  items: z.array(prescriptionItemSchema).min(1, "Add at least one medication.").max(30),
  supersedesId: z.string().uuid().optional(),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const listPrescriptionsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "SUPERSEDED", "EXPIRED"]).optional(),
});

export type ListPrescriptionsQuery = z.infer<typeof listPrescriptionsQuerySchema>;

export const listMedicationsQuerySchema = z.object({
  query: z.string().max(100).optional(),
});

export type ListMedicationsQuery = z.infer<typeof listMedicationsQuerySchema>;
