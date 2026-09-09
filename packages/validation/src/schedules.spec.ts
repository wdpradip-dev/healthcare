import {
  availabilityQuerySchema,
  createScheduleExceptionSchema,
  dayScheduleBlockSchema,
  replaceDoctorScheduleSchema,
} from "./schedules";

describe("dayScheduleBlockSchema", () => {
  const valid = {
    departmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMinutes: 20,
  };

  it("accepts a valid block, defaulting bufferMinutes to 0", () => {
    const result = dayScheduleBlockSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bufferMinutes).toBe(0);
    }
  });

  it("rejects startTime >= endTime", () => {
    expect(dayScheduleBlockSchema.safeParse({ ...valid, startTime: "17:00", endTime: "09:00" }).success).toBe(false);
    expect(dayScheduleBlockSchema.safeParse({ ...valid, startTime: "09:00", endTime: "09:00" }).success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    expect(dayScheduleBlockSchema.safeParse({ ...valid, startTime: "9am" }).success).toBe(false);
  });

  it("rejects dayOfWeek outside 0-6", () => {
    expect(dayScheduleBlockSchema.safeParse({ ...valid, dayOfWeek: 7 }).success).toBe(false);
    expect(dayScheduleBlockSchema.safeParse({ ...valid, dayOfWeek: -1 }).success).toBe(false);
  });
});

describe("replaceDoctorScheduleSchema", () => {
  it("accepts an empty days array (doctor currently unscheduled)", () => {
    expect(replaceDoctorScheduleSchema.safeParse({ days: [] }).success).toBe(true);
  });

  it("accepts multiple non-overlapping blocks on the same day (morning + afternoon)", () => {
    const result = replaceDoctorScheduleSchema.safeParse({
      days: [
        { departmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", dayOfWeek: 1, startTime: "09:00", endTime: "13:00", slotDurationMinutes: 20 },
        { departmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", slotDurationMinutes: 20 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("createScheduleExceptionSchema", () => {
  const base = { type: "LEAVE" as const, startDate: "2026-08-15", endDate: "2026-08-15" };

  it("accepts a full-day exception (no startTime/endTime)", () => {
    expect(createScheduleExceptionSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a partial LEAVE with a matching startTime/endTime pair", () => {
    expect(createScheduleExceptionSchema.safeParse({ ...base, startTime: "09:00", endTime: "11:00" }).success).toBe(true);
  });

  it("rejects startTime without endTime", () => {
    expect(createScheduleExceptionSchema.safeParse({ ...base, startTime: "09:00" }).success).toBe(false);
  });

  it("rejects endDate before startDate", () => {
    expect(createScheduleExceptionSchema.safeParse({ ...base, startDate: "2026-08-15", endDate: "2026-08-10" }).success).toBe(false);
  });

  it("rejects a HOLIDAY exception with a startTime (always full-day)", () => {
    expect(createScheduleExceptionSchema.safeParse({ ...base, type: "HOLIDAY", startTime: "09:00", endTime: "11:00" }).success).toBe(
      false,
    );
  });

  it("rejects REDUCED_HOURS/EXTENDED_HOURS without a startTime/endTime", () => {
    expect(createScheduleExceptionSchema.safeParse({ ...base, type: "REDUCED_HOURS" }).success).toBe(false);
    expect(createScheduleExceptionSchema.safeParse({ ...base, type: "EXTENDED_HOURS" }).success).toBe(false);
  });

  it("accepts a valid REDUCED_HOURS exception", () => {
    expect(
      createScheduleExceptionSchema.safeParse({ ...base, type: "REDUCED_HOURS", startTime: "09:00", endTime: "11:00" }).success,
    ).toBe(true);
  });

  it("has no doctorId/branchId fields — the route's :doctorId path param is the only target", () => {
    expect(Object.keys(createScheduleExceptionSchema.innerType().shape)).not.toEqual(
      expect.arrayContaining(["doctorId", "branchId"]),
    );
  });
});

describe("availabilityQuerySchema", () => {
  const valid = { doctorId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", from: "2026-08-10", to: "2026-08-10" };

  it("accepts a same-day range", () => {
    expect(availabilityQuerySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects to before from", () => {
    expect(availabilityQuerySchema.safeParse({ ...valid, from: "2026-08-10", to: "2026-08-09" }).success).toBe(false);
  });

  it("rejects a range longer than 90 days", () => {
    expect(availabilityQuerySchema.safeParse({ ...valid, from: "2026-01-01", to: "2026-12-31" }).success).toBe(false);
  });
});
