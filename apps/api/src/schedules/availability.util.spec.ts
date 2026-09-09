import { computeAvailability, type AvailabilityException, type AvailabilityScheduleBlock } from "./availability.util";

const DOCTOR_ID = "doctor-1";
const BRANCH_ID = "branch-1";

function block(overrides: Partial<AvailabilityScheduleBlock> = {}): AvailabilityScheduleBlock {
  return {
    dayOfWeek: 1, // Monday
    startTime: "09:00",
    endTime: "10:00",
    slotDurationMinutes: 20,
    bufferMinutes: 0,
    maxAppointments: null,
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    branchId: BRANCH_ID,
    ...overrides,
  };
}

function exception(overrides: Partial<AvailabilityException>): AvailabilityException {
  return {
    type: "LEAVE",
    startDate: "2026-08-10",
    endDate: "2026-08-10",
    startTime: null,
    endTime: null,
    doctorId: DOCTOR_ID,
    branchId: null,
    ...overrides,
  };
}

describe("computeAvailability", () => {
  // 2026-08-10 is a Monday; 2026-08-11 is a Tuesday.
  it("generates slots only on the matching dayOfWeek", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-11",
      schedules: [block()],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    expect(result.days).toHaveLength(2);
    expect(result.days[0]!.date).toBe("2026-08-10");
    expect(result.days[0]!.hasSlots).toBe(true);
    expect(result.days[1]!.date).toBe("2026-08-11");
    expect(result.days[1]!.hasSlots).toBe(false);
    expect(result.days[1]!.slots).toEqual([]);
  });

  it("packs slots back-to-back with zero buffer", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "10:00", slotDurationMinutes: 20, bufferMinutes: 0 })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    // 09:00-09:20, 09:20-09:40, 09:40-10:00 — exactly 3, none overlapping.
    expect(result.days[0]!.slots).toEqual([
      { startTime: "2026-08-10T09:00:00.000Z", endTime: "2026-08-10T09:20:00.000Z" },
      { startTime: "2026-08-10T09:20:00.000Z", endTime: "2026-08-10T09:40:00.000Z" },
      { startTime: "2026-08-10T09:40:00.000Z", endTime: "2026-08-10T10:00:00.000Z" },
    ]);
  });

  it("inserts a gap after every slot when bufferMinutes is set (docs/19 point 4)", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "10:00", slotDurationMinutes: 20, bufferMinutes: 5 })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    // Stride is 25 min (20 + 5 buffer): 09:00-09:20, 09:25-09:45; a third
    // slot would need to end by 10:00 but 09:50+20=10:10 overflows the window.
    expect(result.days[0]!.slots).toEqual([
      { startTime: "2026-08-10T09:00:00.000Z", endTime: "2026-08-10T09:20:00.000Z" },
      { startTime: "2026-08-10T09:25:00.000Z", endTime: "2026-08-10T09:45:00.000Z" },
    ]);
  });

  it("caps the day's slots at maxAppointments even when time-math allows more (docs/19 point 5)", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "10:00", slotDurationMinutes: 20, maxAppointments: 2 })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.slots).toHaveLength(2);
  });

  it("removes the whole day for a full-day HOLIDAY exception", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block()],
      exceptions: [exception({ type: "HOLIDAY" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.hasSlots).toBe(false);
    expect(result.days[0]!.slots).toEqual([]);
  });

  it("removes the whole day for a full-day LEAVE exception (no startTime/endTime)", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block()],
      exceptions: [exception({ type: "LEAVE" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.hasSlots).toBe(false);
  });

  it("carves out only the affected window for a partial LEAVE (startTime/endTime set)", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "10:00", slotDurationMinutes: 20 })],
      exceptions: [exception({ type: "LEAVE", startTime: "09:00", endTime: "09:20" })],
      bookedStartTimesIso: [],
    });

    // The first slot (09:00-09:20) overlaps the blackout and is dropped;
    // the rest of the day's normal hours are untouched.
    expect(result.days[0]!.slots).toEqual([
      { startTime: "2026-08-10T09:20:00.000Z", endTime: "2026-08-10T09:40:00.000Z" },
      { startTime: "2026-08-10T09:40:00.000Z", endTime: "2026-08-10T10:00:00.000Z" },
    ]);
  });

  it("shrinks the working window for REDUCED_HOURS", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      // Normal hours (09:00-13:00) would generate 12 slots; the exception
      // shrinks the day down to a 40-minute window (2 slots).
      schedules: [block({ startTime: "09:00", endTime: "13:00", slotDurationMinutes: 20 })],
      exceptions: [exception({ type: "REDUCED_HOURS", startTime: "09:00", endTime: "09:40" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.slots).toEqual([
      { startTime: "2026-08-10T09:00:00.000Z", endTime: "2026-08-10T09:20:00.000Z" },
      { startTime: "2026-08-10T09:20:00.000Z", endTime: "2026-08-10T09:40:00.000Z" },
    ]);
  });

  it("grows the working window for EXTENDED_HOURS", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "09:20", slotDurationMinutes: 20 })],
      exceptions: [exception({ type: "EXTENDED_HOURS", startTime: "09:00", endTime: "10:00" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.slots).toHaveLength(3);
  });

  it("applies a branch-wide exception (doctorId null) to a block in that branch", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ branchId: "branch-holiday" })],
      exceptions: [exception({ type: "HOLIDAY", doctorId: null, branchId: "branch-holiday" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.hasSlots).toBe(false);
  });

  it("does not apply a branch-wide exception to a block in a different branch", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ branchId: "branch-unaffected" })],
      exceptions: [exception({ type: "HOLIDAY", doctorId: null, branchId: "branch-other" })],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.hasSlots).toBe(true);
  });

  it("excludes a slot whose startTime matches an existing non-terminal appointment", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "09:40", slotDurationMinutes: 20 })],
      exceptions: [],
      bookedStartTimesIso: ["2026-08-10T09:00:00.000Z"],
    });

    expect(result.days[0]!.slots).toEqual([{ startTime: "2026-08-10T09:20:00.000Z", endTime: "2026-08-10T09:40:00.000Z" }]);
  });

  it("respects effectiveFrom/effectiveTo — a block outside its effective range contributes no slots", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "UTC",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ effectiveFrom: "2026-09-01", effectiveTo: null })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    expect(result.days[0]!.hasSlots).toBe(false);
  });

  it("produces the correct UTC offset for a non-UTC timezone", () => {
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "America/Chicago",
      from: "2026-08-10",
      to: "2026-08-10",
      schedules: [block({ startTime: "09:00", endTime: "09:20", slotDurationMinutes: 20 })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    // Mid-August is CDT (UTC-5) in America/Chicago.
    expect(result.days[0]!.slots[0]!.startTime).toBe("2026-08-10T09:00:00.000-05:00");
  });

  it("crosses a DST transition correctly (America/Chicago, spring-forward on 2026-03-08)", () => {
    // 2026-03-02 and 2026-03-09 are both Mondays; DST starts 2026-03-08.
    const result = computeAvailability({
      doctorId: DOCTOR_ID,
      timezone: "America/Chicago",
      from: "2026-03-02",
      to: "2026-03-09",
      schedules: [block({ startTime: "09:00", endTime: "09:20", slotDurationMinutes: 20 })],
      exceptions: [],
      bookedStartTimesIso: [],
    });

    const before = result.days.find((d) => d.date === "2026-03-02")!;
    const after = result.days.find((d) => d.date === "2026-03-09")!;
    expect(before.slots[0]!.startTime).toBe("2026-03-02T09:00:00.000-06:00"); // CST
    expect(after.slots[0]!.startTime).toBe("2026-03-09T09:00:00.000-05:00"); // CDT
  });
});
