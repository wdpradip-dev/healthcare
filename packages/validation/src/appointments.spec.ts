import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  markNoShowSchema,
  rescheduleAppointmentSchema,
} from "./appointments";

const DOCTOR_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const DEPARTMENT_ID = "4fa85f64-5717-4562-b3fc-2c963f66afa6";
const PATIENT_ID = "5fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("createAppointmentSchema", () => {
  const valid = { doctorId: DOCTOR_ID, departmentId: DEPARTMENT_ID, startTime: "2026-08-08T09:00:00-05:00" };

  it("accepts a minimal self-service booking (no patientId)", () => {
    expect(createAppointmentSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a staff booking with patientId and reason", () => {
    const result = createAppointmentSchema.safeParse({ ...valid, patientId: PATIENT_ID, reason: "Annual checkup" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID doctorId", () => {
    expect(createAppointmentSchema.safeParse({ ...valid, doctorId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a startTime without an explicit offset", () => {
    expect(createAppointmentSchema.safeParse({ ...valid, startTime: "2026-08-08T09:00:00" }).success).toBe(false);
  });

  it("rejects a reason over 500 characters", () => {
    expect(createAppointmentSchema.safeParse({ ...valid, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("rescheduleAppointmentSchema", () => {
  it("accepts newStartTime alone", () => {
    expect(rescheduleAppointmentSchema.safeParse({ newStartTime: "2026-08-09T10:00:00-05:00" }).success).toBe(true);
  });

  it("accepts an optional overrideReason", () => {
    expect(
      rescheduleAppointmentSchema.safeParse({ newStartTime: "2026-08-09T10:00:00-05:00", overrideReason: "Patient requested" }).success,
    ).toBe(true);
  });

  it("rejects a missing newStartTime", () => {
    expect(rescheduleAppointmentSchema.safeParse({}).success).toBe(false);
  });
});

describe("cancelAppointmentSchema", () => {
  it("accepts an empty body", () => {
    expect(cancelAppointmentSchema.safeParse({}).success).toBe(true);
  });

  it("accepts an optional reason", () => {
    expect(cancelAppointmentSchema.safeParse({ reason: "Patient unavailable" }).success).toBe(true);
  });
});

describe("markNoShowSchema", () => {
  it("accepts an empty body", () => {
    expect(markNoShowSchema.safeParse({}).success).toBe(true);
  });
});

describe("listAppointmentsQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(listAppointmentsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full filter set", () => {
    const result = listAppointmentsQuerySchema.safeParse({
      status: "CONFIRMED",
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      from: "2026-08-01",
      to: "2026-08-31",
      view: "calendar",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(listAppointmentsQuerySchema.safeParse({ status: "UPCOMING" }).success).toBe(false);
  });
});
