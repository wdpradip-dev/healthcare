import { z } from "zod";

/**
 * `/lab-orders` and `/reports` DTOs — docs/15-API-SPECIFICATION.md and the
 * pipeline in docs/21-REPORTS-AND-DOCUMENTS.md / docs/27-MEDICAL-AI-SAFETY.md.
 */

export const createLabOrderSchema = z
  .object({
    /** Required unless `consultationId` is given (then the consultation's patient is used). */
    patientId: z.string().uuid().optional(),
    consultationId: z.string().uuid().optional(),
    testType: z.string().min(1, "Test type is required.").max(200),
    priority: z.enum(["ROUTINE", "URGENT"]).default("ROUTINE"),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.patientId !== undefined || v.consultationId !== undefined, {
    message: "Provide a patientId or a consultationId.",
    path: ["patientId"],
  });

export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const listLabOrdersQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  status: z.enum(["ORDERED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

export type ListLabOrdersQuery = z.infer<typeof listLabOrdersQuerySchema>;

/** One analyte, e.g. `{ value: 13.2, unit: "g/dL", referenceRange: "12-16", flag: "NORMAL" }`. */
export const structuredValueSchema = z.object({
  value: z.union([z.string().max(200), z.number()]),
  unit: z.string().max(40).optional(),
  referenceRange: z.string().max(80).optional(),
  flag: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
});

export const structuredValuesSchema = z
  .record(z.string().min(1).max(100), structuredValueSchema)
  .refine((v) => Object.keys(v).length > 0, { message: "Enter at least one value." })
  .refine((v) => Object.keys(v).length <= 100, { message: "Too many values." });

export type StructuredValues = z.infer<typeof structuredValuesSchema>;

const findingsSchema = z.string().min(1).max(10_000);

/** Multipart fields arrive as strings — `structuredValues` is a JSON string. */
const jsonString = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return v;
  }
};

export const createReportFieldsSchema = z
  .object({
    labOrderId: z.string().uuid(),
    type: z.enum(["lab", "imaging"]),
    title: z.string().min(1, "Title is required.").max(200),
    structuredValues: z.preprocess(jsonString, structuredValuesSchema.optional()),
    findings: findingsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "lab" && v.findings !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Lab reports use structuredValues, not findings.", path: ["findings"] });
    }
    if (v.type === "imaging" && v.structuredValues !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Imaging reports use findings, not structuredValues.", path: ["structuredValues"] });
    }
  });

export type CreateReportFields = z.infer<typeof createReportFieldsSchema>;

export const updateReportSchema = z
  .object({
    structuredValues: structuredValuesSchema.optional(),
    findings: findingsSchema.optional(),
  })
  .refine((v) => v.structuredValues !== undefined || v.findings !== undefined, { message: "Nothing to update." });

export type UpdateReportInput = z.infer<typeof updateReportSchema>;

/** docs/27 "Doctor review requirements": an explicit three-way decision on the AI text specifically. */
export const verifyReportSchema = z
  .object({
    aiSummaryDecision: z.enum(["ACCEPT", "EDIT", "DISCARD"]).optional(),
    editedAiSummary: z.string().min(1).max(5000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.aiSummaryDecision === "EDIT" && !v.editedAiSummary) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide the edited summary.", path: ["editedAiSummary"] });
    }
    if (v.aiSummaryDecision !== "EDIT" && v.editedAiSummary !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "editedAiSummary is only valid with EDIT.", path: ["editedAiSummary"] });
    }
  });

export type VerifyReportInput = z.infer<typeof verifyReportSchema>;

export const listReportsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  type: z.enum(["lab", "imaging"]).optional(),
  status: z.enum(["RAW", "EXTRACTED", "AI_ANALYZED", "HUMAN_REVIEWED", "RELEASED"]).optional(),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
