import { z } from "zod";

/**
 * `/consultations` and `/medical-records` DTO schemas — mirrors
 * docs/15-API-SPECIFICATION.md. The clinical rows themselves are docs/13's
 * Consultation/ClinicalNote/Diagnosis/Vital/MedicalCondition/Allergy.
 */

export const startConsultationSchema = z.object({
  appointmentId: z.string().uuid(),
});

export type StartConsultationInput = z.infer<typeof startConsultationSchema>;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Every field optional (a nurse may record only BP), but at least one is required. */
export const vitalsInputSchema = z
  .object({
    bloodPressureSystolic: int(40, 300).optional(),
    bloodPressureDiastolic: int(20, 200).optional(),
    heartRate: int(20, 300).optional(),
    temperatureCelsius: z.number().min(25).max(45).optional(),
    weightKg: z.number().min(0.5).max(500).optional(),
    heightCm: z.number().min(20).max(260).optional(),
    spo2: int(50, 100).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "At least one vital sign is required." });

export type VitalsInput = z.infer<typeof vitalsInputSchema>;

export const clinicalNoteInputSchema = z.object({
  /** Present = update that note (author only); absent = create. */
  id: z.string().uuid().optional(),
  content: z.string().min(1, "Note cannot be empty.").max(10_000),
  isInternal: z.boolean().default(false),
});

export const diagnosisInputSchema = z.object({
  icd10Code: z.string().max(20).optional(),
  description: z.string().min(1, "Description is required.").max(500),
});

/**
 * `PATCH /consultations/:id` (docs/09 "autosaves every 30s"): `notes` are
 * upserted by id, `diagnoses` replace the consultation's whole set (a draft
 * list edited in place — send the full list each time), `vitals` upserts the
 * caller's own vitals row. All optional; at least one key required.
 */
export const updateConsultationSchema = z
  .object({
    notes: z.array(clinicalNoteInputSchema).max(50).optional(),
    diagnoses: z.array(diagnosisInputSchema).max(50).optional(),
    vitals: vitalsInputSchema.optional(),
  })
  .refine((v) => v.notes !== undefined || v.diagnoses !== undefined || v.vitals !== undefined, {
    message: "Nothing to update.",
  });

export type UpdateConsultationInput = z.infer<typeof updateConsultationSchema>;

export const listMedicalRecordsQuerySchema = z.object({
  // Required for staff callers (a PATIENT always means themself).
  patientId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  // Only consultations exist until Phase 9 adds reports/prescriptions.
  type: z.enum(["CONSULTATION"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type ListMedicalRecordsQuery = z.infer<typeof listMedicalRecordsQuerySchema>;

/** `summary` / `conditions` / `allergies` — same subject-selection rule as the list. */
export const medicalRecordsSubjectQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
});

export type MedicalRecordsSubjectQuery = z.infer<typeof medicalRecordsSubjectQuerySchema>;

export const createConditionSchema = z.object({
  patientId: z.string().uuid(),
  name: z.string().min(1, "Name is required.").max(200),
  status: z.enum(["ACTIVE", "RESOLVED", "CHRONIC"]).default("ACTIVE"),
  diagnosedDate: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateConditionInput = z.infer<typeof createConditionSchema>;

export const createAllergySchema = z.object({
  patientId: z.string().uuid(),
  allergen: z.string().min(1, "Allergen is required.").max(200),
  reaction: z.string().max(500).optional(),
  severity: z.enum(["MILD", "MODERATE", "SEVERE"]),
});

export type CreateAllergyInput = z.infer<typeof createAllergySchema>;
