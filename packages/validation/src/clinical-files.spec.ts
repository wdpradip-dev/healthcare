import { createPrescriptionSchema, prescriptionItemSchema } from "./prescriptions";
import { createLabOrderSchema, createReportFieldsSchema, updateReportSchema, verifyReportSchema } from "./reports";
import { uploadDocumentFieldsSchema } from "./documents";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("prescriptionItemSchema", () => {
  const base = { dosage: "500mg", frequency: "daily" };
  it("takes exactly one of a formulary medication or a free-text name", () => {
    expect(prescriptionItemSchema.safeParse({ ...base, medicationId: UUID }).success).toBe(true);
    expect(prescriptionItemSchema.safeParse({ ...base, freeTextName: "ORS" }).success).toBe(true);
    expect(prescriptionItemSchema.safeParse(base).success).toBe(false);
    expect(prescriptionItemSchema.safeParse({ ...base, medicationId: UUID, freeTextName: "ORS" }).success).toBe(false);
  });
  it("requires dosage and frequency", () => {
    expect(prescriptionItemSchema.safeParse({ freeTextName: "ORS", frequency: "daily" }).success).toBe(false);
  });
});

describe("createPrescriptionSchema", () => {
  it("needs at least one item", () => {
    expect(createPrescriptionSchema.safeParse({ consultationId: UUID, items: [] }).success).toBe(false);
  });
});

describe("createLabOrderSchema", () => {
  it("needs a patient or a consultation and defaults priority", () => {
    expect(createLabOrderSchema.safeParse({ testType: "CBC" }).success).toBe(false);
    const ok = createLabOrderSchema.parse({ testType: "CBC", consultationId: UUID });
    expect(ok.priority).toBe("ROUTINE");
  });
});

describe("createReportFieldsSchema", () => {
  const base = { labOrderId: UUID, title: "CBC" };
  it("parses structuredValues sent as a multipart JSON string", () => {
    const parsed = createReportFieldsSchema.parse({ ...base, type: "lab", structuredValues: JSON.stringify({ Hb: { value: 13 } }) });
    expect(parsed.structuredValues).toEqual({ Hb: { value: 13 } });
  });
  it("rejects malformed JSON and empty value sets", () => {
    expect(createReportFieldsSchema.safeParse({ ...base, type: "lab", structuredValues: "{oops" }).success).toBe(false);
    expect(createReportFieldsSchema.safeParse({ ...base, type: "lab", structuredValues: "{}" }).success).toBe(false);
  });
  it("keeps lab and imaging payloads apart", () => {
    expect(createReportFieldsSchema.safeParse({ ...base, type: "lab", findings: "x" }).success).toBe(false);
    expect(createReportFieldsSchema.safeParse({ ...base, type: "imaging", structuredValues: "{\"a\":{\"value\":1}}" }).success).toBe(false);
    expect(createReportFieldsSchema.safeParse({ ...base, type: "imaging", findings: "clear" }).success).toBe(true);
  });
});

describe("updateReportSchema", () => {
  it("needs something to update", () => {
    expect(updateReportSchema.safeParse({}).success).toBe(false);
    expect(updateReportSchema.safeParse({ findings: "clear" }).success).toBe(true);
  });
});

describe("verifyReportSchema", () => {
  it("requires the edited text exactly when the decision is EDIT", () => {
    expect(verifyReportSchema.safeParse({ aiSummaryDecision: "EDIT" }).success).toBe(false);
    expect(verifyReportSchema.safeParse({ aiSummaryDecision: "EDIT", editedAiSummary: "ok" }).success).toBe(true);
    expect(verifyReportSchema.safeParse({ aiSummaryDecision: "ACCEPT", editedAiSummary: "ok" }).success).toBe(false);
  });
  it("allows an empty body (no AI summary)", () => {
    expect(verifyReportSchema.safeParse({}).success).toBe(true);
  });
});

describe("uploadDocumentFieldsSchema", () => {
  it("never lets a client pick a system category", () => {
    expect(uploadDocumentFieldsSchema.safeParse({ category: "REPORT_ATTACHMENT" }).success).toBe(false);
    expect(uploadDocumentFieldsSchema.parse({}).category).toBe("OTHER");
  });
  it("needs the link type and id together", () => {
    expect(uploadDocumentFieldsSchema.safeParse({ linkedEntityType: "Appointment" }).success).toBe(false);
    expect(uploadDocumentFieldsSchema.safeParse({ linkedEntityType: "Appointment", linkedEntityId: UUID }).success).toBe(true);
  });
});
