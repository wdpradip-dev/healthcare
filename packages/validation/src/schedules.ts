import { z } from "zod";

/**
 * `/schedules` DTO schemas — mirrors docs/15-API-SPECIFICATION.md "/schedules"
 * and the availability model in docs/19-APPOINTMENT-ENGINE.md. Appointment
 * booking itself is Phase 7; this phase only covers the weekly template,
 * one-off exceptions, and the read-only availability computation over them.
 */
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be 24h HH:MM, e.g. 09:00.");

const timeRangeRefinement = (data: { startTime: string; endTime: string }, ctx: z.RefinementCtx) => {
  if (data.startTime >= data.endTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startTime must be before endTime.", path: ["endTime"] });
  }
};

export const dayScheduleBlockSchema = z
  .object({
    departmentId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0, "0 (Sunday) - 6 (Saturday).").max(6),
    startTime: HHMM,
    endTime: HHMM,
    slotDurationMinutes: z.number().int().positive().max(240),
    bufferMinutes: z.number().int().nonnegative().max(120).default(0),
    maxAppointments: z.number().int().positive().optional(),
  })
  .superRefine(timeRangeRefinement);

export type DayScheduleBlock = z.infer<typeof dayScheduleBlockSchema>;

/**
 * `PUT /schedules/:doctorId` replaces the doctor's entire weekly template in
 * one call (docs/09-ADMIN-DESIGN-MOCKUPS.md's "Weekly Template" is a single
 * current view, not a history) — no partial-update semantics, no separate
 * per-row delete endpoint.
 */
export const replaceDoctorScheduleSchema = z.object({
  days: z.array(dayScheduleBlockSchema).max(50),
});

export type ReplaceDoctorScheduleInput = z.infer<typeof replaceDoctorScheduleSchema>;

const exceptionTimeRefinement = (
  data: { type: string; startTime?: string; endTime?: string },
  ctx: z.RefinementCtx,
) => {
  const hasStart = data.startTime !== undefined;
  const hasEnd = data.endTime !== undefined;
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startTime and endTime must be provided together, or not at all.",
      path: ["endTime"],
    });
    return;
  }
  if (data.type === "HOLIDAY" && hasStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A HOLIDAY exception is always full-day.", path: ["startTime"] });
  }
  if ((data.type === "REDUCED_HOURS" || data.type === "EXTENDED_HOURS") && !hasStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startTime/endTime are required for REDUCED_HOURS/EXTENDED_HOURS.",
      path: ["startTime"],
    });
  }
  if (hasStart && hasEnd && data.startTime! >= data.endTime!) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startTime must be before endTime.", path: ["endTime"] });
  }
};

/**
 * `POST /schedules/:doctorId/exceptions` is always scoped to the path's
 * `:doctorId` (docs/15-API-SPECIFICATION.md) — there is no documented route
 * for creating the model's other case (`ScheduleException.doctorId = null`,
 * a branch/hospital-wide holiday), so this body never accepts a doctorId or
 * branchId; the service sets `doctorId` from the path param. The
 * branch-wide case still exists in the schema and `AvailabilityService`
 * already honors it (docs/13-DATABASE-DESIGN.md "ScheduleException") — it's
 * just not creatable via any Phase 6 endpoint, per CLAUDE.md's rule against
 * inventing undocumented routes.
 */
export const createScheduleExceptionSchema = z
  .object({
    type: z.enum(["LEAVE", "HOLIDAY", "EXTENDED_HOURS", "REDUCED_HOURS"]),
    startDate: z.string().date(),
    endDate: z.string().date(),
    startTime: HHMM.optional(),
    endTime: HHMM.optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate < data.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must be on or after startDate.", path: ["endDate"] });
    }
    exceptionTimeRefinement(data, ctx);
  });

export type CreateScheduleExceptionInput = z.infer<typeof createScheduleExceptionSchema>;

export const listScheduleExceptionsQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type ListScheduleExceptionsQuery = z.infer<typeof listScheduleExceptionsQuerySchema>;

const MAX_AVAILABILITY_RANGE_DAYS = 90;

export const availabilityQuerySchema = z
  .object({
    doctorId: z.string().uuid(),
    departmentId: z.string().uuid().optional(),
    from: z.string().date(),
    to: z.string().date(),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "to must be on or after from.", path: ["to"] });
      return;
    }
    const spanDays = (new Date(data.to).getTime() - new Date(data.from).getTime()) / 86_400_000;
    if (spanDays > MAX_AVAILABILITY_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Range cannot exceed ${MAX_AVAILABILITY_RANGE_DAYS} days.`,
        path: ["to"],
      });
    }
  });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
