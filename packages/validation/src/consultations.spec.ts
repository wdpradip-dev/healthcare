import {
  createAllergySchema,
  createConditionSchema,
  listMedicalRecordsQuerySchema,
  startConsultationSchema,
  updateConsultationSchema,
  vitalsInputSchema,
} from "./consultations";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("startConsultationSchema", () => {
  it("requires a UUID appointmentId", () => {
    expect(startConsultationSchema.safeParse({ appointmentId: UUID }).success).toBe(true);
    expect(startConsultationSchema.safeParse({ appointmentId: "nope" }).success).toBe(false);
  });
});

describe("vitalsInputSchema", () => {
  it("accepts a partial set of vitals", () => {
    expect(vitalsInputSchema.safeParse({ heartRate: 76 }).success).toBe(true);
  });

  it("requires at least one vital", () => {
    expect(vitalsInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects physiologically impossible values", () => {
    expect(vitalsInputSchema.safeParse({ spo2: 140 }).success).toBe(false);
    expect(vitalsInputSchema.safeParse({ temperatureCelsius: 80 }).success).toBe(false);
    expect(vitalsInputSchema.safeParse({ heartRate: 0 }).success).toBe(false);
  });
});

describe("updateConsultationSchema", () => {
  it("defaults isInternal to false", () => {
    const result = updateConsultationSchema.safeParse({ notes: [{ content: "hi" }] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes![0]!.isInternal).toBe(false);
    }
  });

  it("rejects an empty body and empty note content", () => {
    expect(updateConsultationSchema.safeParse({}).success).toBe(false);
    expect(updateConsultationSchema.safeParse({ notes: [{ content: "" }] }).success).toBe(false);
  });

  it("accepts an empty diagnoses list (clearing the draft list)", () => {
    expect(updateConsultationSchema.safeParse({ diagnoses: [] }).success).toBe(true);
  });
});

describe("medical record schemas", () => {
  it("validates allergy severity", () => {
    expect(createAllergySchema.safeParse({ patientId: UUID, allergen: "Latex", severity: "SEVERE" }).success).toBe(true);
    expect(createAllergySchema.safeParse({ patientId: UUID, allergen: "Latex", severity: "DEADLY" }).success).toBe(false);
  });

  it("defaults condition status to ACTIVE", () => {
    const result = createConditionSchema.safeParse({ patientId: UUID, name: "Asthma" });
    expect(result.success && result.data.status).toBe("ACTIVE");
  });

  it("only accepts the CONSULTATION record type for now", () => {
    expect(listMedicalRecordsQuerySchema.safeParse({ type: "CONSULTATION" }).success).toBe(true);
    expect(listMedicalRecordsQuerySchema.safeParse({ type: "LAB_REPORT" }).success).toBe(false);
  });
});
