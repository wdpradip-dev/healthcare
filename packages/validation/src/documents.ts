import { z } from "zod";

/** `/documents` DTOs — docs/15-API-SPECIFICATION.md, docs/21-REPORTS-AND-DOCUMENTS.md. */

/** Categories a person may pick when uploading; `REPORT_ATTACHMENT`/`PRESCRIPTION_PDF` are system-made. */
export const uploadableDocumentCategorySchema = z.enum(["ID_PROOF", "INSURANCE", "OTHER"]);

/** Only clinical encounters a person can attach a document to; report attachments are created by the reports module. */
export const documentLinkTypeSchema = z.enum(["Consultation", "Appointment"]);

/** Multipart text fields (the file itself is the `file` part). */
export const uploadDocumentFieldsSchema = z
  .object({
    /** Staff only — a Patient always uploads for themself. */
    patientId: z.string().uuid().optional(),
    category: uploadableDocumentCategorySchema.default("OTHER"),
    linkedEntityType: documentLinkTypeSchema.optional(),
    linkedEntityId: z.string().uuid().optional(),
  })
  .refine((v) => (v.linkedEntityType === undefined) === (v.linkedEntityId === undefined), {
    message: "linkedEntityType and linkedEntityId must be given together.",
    path: ["linkedEntityId"],
  });

export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;

export const listDocumentsQuerySchema = z
  .object({
    patientId: z.string().uuid().optional(),
    hospitalId: z.string().uuid().optional(),
    category: z.enum(["REPORT_ATTACHMENT", "PRESCRIPTION_PDF", "ID_PROOF", "INSURANCE", "OTHER"]).optional(),
    linkedEntityType: z.string().max(40).optional(),
    linkedEntityId: z.string().uuid().optional(),
  });

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
