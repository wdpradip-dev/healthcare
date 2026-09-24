import { DomainException } from "@hospital/shared";

/**
 * Pure policy-window checks over `HospitalSettings` — docs/19-APPOINTMENT-ENGINE.md
 * "Policy configuration". No Prisma/NestJS types here on purpose (mirrors
 * `schedules/availability.util.ts`'s "pure function" convention), so these
 * are unit-testable without a database.
 */

export interface BookingPolicy {
  minBookingLeadMinutes: number;
  maxAdvanceBookingDays: number;
  cancellationWindowMinutes: number;
  rescheduleWindowMinutes: number;
  maxReschedulesPerAppointment: number;
  autoConfirmBookings: boolean;
  checkinWindowMinutes: number;
}

/** Not currently hospital-configurable — docs/19 "No-show handling". */
export const NO_SHOW_GRACE_MINUTES = 15;

function minutesUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 60_000;
}

/** docs/19 "Same-day booking": both bounds are just this same check evaluated against `now`. */
export function assertWithinBookingWindow(startTime: Date, now: Date, policy: BookingPolicy): void {
  const minutes = minutesUntil(startTime, now);
  if (minutes < policy.minBookingLeadMinutes) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `Bookings require at least ${policy.minBookingLeadMinutes} minutes' notice.`);
  }
  const maxAdvanceMinutes = policy.maxAdvanceBookingDays * 24 * 60;
  if (minutes > maxAdvanceMinutes) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `Bookings cannot be made more than ${policy.maxAdvanceBookingDays} days in advance.`);
  }
}

/**
 * `isSelfService` (the acting patient cancelling/rescheduling their own
 * appointment) is hard-blocked outside the window; staff acting within the
 * window may proceed but only with a `reason`/`overrideReason` supplied
 * (docs/19: "staff can override with a mandatory audited reason"). Returns
 * whether this action is a "late" one (inside the window) — callers use this
 * for `Appointment.isLateCancellation`.
 */
export function checkWindow(startTime: Date, now: Date, windowMinutes: number, isSelfService: boolean, overrideReason: string | undefined): boolean {
  const isLate = minutesUntil(startTime, now) < windowMinutes;
  if (!isLate) {
    return false;
  }
  if (isSelfService) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `This action requires at least ${windowMinutes} minutes' notice.`);
  }
  if (!overrideReason) {
    throw new DomainException("VALIDATION_ERROR", "A reason is required to override the notice window.", [
      { field: "reason", message: "Required when acting within the notice window." },
    ]);
  }
  return true;
}

export function assertRescheduleLimitNotExceeded(rescheduleCount: number, policy: BookingPolicy): void {
  if (rescheduleCount >= policy.maxReschedulesPerAppointment) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `This appointment has already been rescheduled the maximum of ${policy.maxReschedulesPerAppointment} times.`);
  }
}

export function assertCheckinWindowOpen(startTime: Date, now: Date, policy: BookingPolicy): void {
  if (minutesUntil(startTime, now) > policy.checkinWindowMinutes) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `Check-in opens ${policy.checkinWindowMinutes} minutes before the appointment.`);
  }
}

export function assertNoShowEligible(startTime: Date, now: Date): void {
  if (minutesUntil(startTime, now) > -NO_SHOW_GRACE_MINUTES) {
    throw new DomainException("APPOINTMENT_NOT_AVAILABLE", `An appointment can only be marked no-show ${NO_SHOW_GRACE_MINUTES} minutes after its start time.`);
  }
}
