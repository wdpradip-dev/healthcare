import { DateTime } from "luxon";

/**
 * Pure availability computation — docs/19-APPOINTMENT-ENGINE.md "Inputs to
 * availability": "Slot generation is a pure function of these inputs — it
 * holds no locks and performs no writes." No Prisma/NestJS types appear
 * here on purpose, so this is unit-testable (T-605) without a database.
 * `AvailabilityService` (availability.service.ts) does the DB reads and
 * shapes their results into these plain inputs.
 */

export type ScheduleExceptionKind = "LEAVE" | "HOLIDAY" | "EXTENDED_HOURS" | "REDUCED_HOURS";

export interface AvailabilityScheduleBlock {
  /** 0 (Sunday) – 6 (Saturday) — docs/13-DATABASE-DESIGN.md "DoctorSchedule". */
  dayOfWeek: number;
  /** Wall-clock "HH:MM", interpreted in `timezone`. */
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxAppointments: number | null;
  /** "YYYY-MM-DD"; effectiveTo null = ongoing. */
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The block's own department's branch — resolves branch-wide exceptions per-block. */
  branchId: string;
}

export interface AvailabilityException {
  type: ScheduleExceptionKind;
  /** "YYYY-MM-DD", inclusive range. */
  startDate: string;
  endDate: string;
  /** Wall-clock "HH:MM"; both null = full day. */
  startTime: string | null;
  endTime: string | null;
  /** null = branch-wide (matched against a block's branchId instead). */
  doctorId: string | null;
  branchId: string | null;
}

export interface ComputeAvailabilityInput {
  doctorId: string;
  /** IANA zone, e.g. "America/Chicago" — HospitalSettings.timezone (Phase 6). */
  timezone: string;
  /** "YYYY-MM-DD", inclusive range. */
  from: string;
  to: string;
  schedules: AvailabilityScheduleBlock[];
  exceptions: AvailabilityException[];
  /** ISO instants of existing non-terminal Appointment.startTime values for this doctor (Phase 7 populates this; always empty until then). */
  bookedStartTimesIso: string[];
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
}

export interface DayAvailability {
  date: string;
  hasSlots: boolean;
  slots: AvailabilitySlot[];
}

export interface AvailabilityResult {
  doctorId: string;
  days: DayAvailability[];
}

interface WallWindow {
  startTime: string;
  endTime: string;
}

export function computeAvailability(input: ComputeAvailabilityInput): AvailabilityResult {
  const days: DayAvailability[] = [];
  const bookedSet = new Set(input.bookedStartTimesIso);

  let cursor = DateTime.fromISO(input.from, { zone: input.timezone }).startOf("day");
  const end = DateTime.fromISO(input.to, { zone: input.timezone }).startOf("day");

  while (cursor <= end) {
    const date = cursor.toISODate()!;
    // Luxon's ISO weekday is 1 (Mon) - 7 (Sun); DoctorSchedule.dayOfWeek is
    // 0 (Sun) - 6 (Sat) — `% 7` maps 7→0 and leaves 1-6 unchanged.
    const dayOfWeek = cursor.weekday % 7;

    const blocksForDay = input.schedules.filter(
      (s) => s.dayOfWeek === dayOfWeek && s.effectiveFrom <= date && (s.effectiveTo === null || s.effectiveTo >= date),
    );

    const exceptionsForDay = input.exceptions.filter((e) => e.startDate <= date && e.endDate >= date);

    const slots: AvailabilitySlot[] = [];
    for (const block of blocksForDay) {
      const applicable = exceptionsForDay.filter((e) => e.doctorId === input.doctorId || (e.doctorId === null && e.branchId === block.branchId));

      const fullDayOff = applicable.some((e) => (e.type === "HOLIDAY" || e.type === "LEAVE") && e.startTime === null);
      if (fullDayOff) {
        continue;
      }

      // REDUCED_HOURS/EXTENDED_HOURS replace the block's normal window for
      // this date; a later one in the list wins if more than one applies
      // (shouldn't normally happen — same doctor, same day, two overrides —
      // but a deterministic "last wins" beats a silent pick).
      const overrides = applicable.filter((e) => e.type === "REDUCED_HOURS" || e.type === "EXTENDED_HOURS");
      const override = overrides.length > 0 ? overrides[overrides.length - 1] : undefined;
      const window: WallWindow = override
        ? { startTime: override.startTime!, endTime: override.endTime! }
        : { startTime: block.startTime, endTime: block.endTime };

      // Partial LEAVE — a blackout carved out of the (possibly already
      // overridden) window, not a full-day close.
      const partialLeaves = applicable.filter((e) => e.type === "LEAVE" && e.startTime !== null);

      slots.push(...generateSlotsForWindow(date, window, block, partialLeaves, input.timezone));
    }

    slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const cappedSlots = applyDailyCap(slots, blocksForDay);
    const availableSlots = cappedSlots.filter((s) => !bookedSet.has(s.startTime));

    days.push({ date, hasSlots: availableSlots.length > 0, slots: availableSlots });
    cursor = cursor.plus({ days: 1 });
  }

  return { doctorId: input.doctorId, days };
}

function generateSlotsForWindow(
  date: string,
  window: WallWindow,
  block: AvailabilityScheduleBlock,
  partialLeaves: AvailabilityException[],
  timezone: string,
): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  const strideMinutes = block.slotDurationMinutes + block.bufferMinutes;
  let slotStart = toZonedDateTime(date, window.startTime, timezone);
  const windowEnd = toZonedDateTime(date, window.endTime, timezone);

  while (slotStart.plus({ minutes: block.slotDurationMinutes }) <= windowEnd) {
    const slotEnd = slotStart.plus({ minutes: block.slotDurationMinutes });
    const blocked = partialLeaves.some((leave) => {
      const leaveStart = toZonedDateTime(date, leave.startTime!, timezone);
      const leaveEnd = toZonedDateTime(date, leave.endTime!, timezone);
      return slotStart < leaveEnd && slotEnd > leaveStart;
    });
    if (!blocked) {
      slots.push({ startTime: slotStart.toISO()!, endTime: slotEnd.toISO()! });
    }
    slotStart = slotStart.plus({ minutes: strideMinutes });
  }

  return slots;
}

/**
 * docs/19 point 5: "Capped by maxAppointments per day if set, even if
 * time-math would allow more." A day can be covered by more than one block
 * (e.g. morning + afternoon session); each block's own cap applies only to
 * the slots it generated, chronologically trimmed.
 */
function applyDailyCap(slots: AvailabilitySlot[], blocksForDay: AvailabilityScheduleBlock[]): AvailabilitySlot[] {
  const anyCap = blocksForDay.some((b) => b.maxAppointments !== null);
  if (!anyCap) {
    return slots;
  }
  // Single-block-per-day is the common case; for multiple blocks with caps,
  // apply the day's total slot count against the sum of their caps.
  const totalCap = blocksForDay.reduce((sum, b) => sum + (b.maxAppointments ?? Number.POSITIVE_INFINITY), 0);
  return slots.slice(0, totalCap);
}

function toZonedDateTime(date: string, hhmm: string, timezone: string): DateTime {
  return DateTime.fromISO(`${date}T${hhmm}:00`, { zone: timezone });
}
