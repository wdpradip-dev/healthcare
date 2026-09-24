import { z } from "zod";

/**
 * `/appointments` DTO schemas — mirrors docs/15-API-SPECIFICATION.md
 * "/appointments" and the booking/reschedule/cancel/check-in rules in
 * docs/19-APPOINTMENT-ENGINE.md. `startTime`/`newStartTime` are full ISO
 * instants (not the wall-clock "HH:MM" used by the schedules DTOs) because a
 * booking targets one exact moment, already resolved against the hospital's
 * timezone by whatever produced it (an availability slot's own `startTime`).
 */

export const appointmentStatusSchema = z.enum(["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]);

/**
 * `patientId` is optional: a self-service `PATIENT` caller books for
 * themselves (the service resolves it from `actor.sub`), while `RECEPTIONIST`/
 * `ADMIN`/`SUPER_ADMIN` booking on a patient's behalf must supply it.
 * `hospitalId` is likewise only needed for a `SUPER_ADMIN` caller — see
 * apps/api/src/common/tenant-scope.util.ts.
 */
export const createAppointmentSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  departmentId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  startTime: z.string().datetime({ offset: true }),
  reason: z.string().max(500).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  newStartTime: z.string().datetime({ offset: true }),
  overrideReason: z.string().max(500).optional(),
});

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const markNoShowSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type MarkNoShowInput = z.infer<typeof markNoShowSchema>;

export const listAppointmentsQuerySchema = z.object({
  // Required for a Super Admin (platform-scope) caller — see
  // apps/api/src/common/tenant-scope.util.ts.
  hospitalId: z.string().uuid().optional(),
  status: appointmentStatusSchema.optional(),
  doctorId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  view: z.enum(["list", "calendar"]).optional(),
});

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
