import { Injectable } from "@nestjs/common";
import { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { CancelAppointmentInput, MarkNoShowInput, RescheduleAppointmentInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { getHospitalTimezone } from "../schedules/schedule-access.util";
import { AvailabilityService } from "../schedules/availability.service";
import { APPOINTMENT_INCLUDE, assertNotTerminal, loadAppointmentInScope, type AppointmentWithRelations } from "./appointment-access.util";
import { assertCheckinWindowOpen, assertNoShowEligible, assertRescheduleLimitNotExceeded, checkWindow, type BookingPolicy } from "./appointment-policy.util";
import { NotificationStubService } from "./notification-stub.service";
import { DateTime } from "luxon";

/**
 * `PATCH /appointments/:id/reschedule|cancel|no-show`, `POST /appointments/:id/checkin`.
 * `appointments.update` (guard-level) covers both reschedule and no-show —
 * docs/02-PERSONAS-AND-ROLES.md's per-role prose splits that one permission
 * into two different allowed sub-actions (a Patient may only reschedule their
 * own booking; a Doctor's grant is "complete/no-show", never reschedule), so
 * each method here re-checks the caller's role for its own sub-action on top
 * of the scope check `loadAppointmentInScope` already performs.
 */
const RESCHEDULE_ALLOWED_ROLES = new Set(["PATIENT", "RECEPTIONIST", "ADMIN", "SUPER_ADMIN"]);
const NO_SHOW_ALLOWED_ROLES = new Set(["DOCTOR", "RECEPTIONIST", "ADMIN", "SUPER_ADMIN"]);

const DEFAULT_POLICY: BookingPolicy = {
  minBookingLeadMinutes: 60,
  maxAdvanceBookingDays: 60,
  cancellationWindowMinutes: 120,
  rescheduleWindowMinutes: 120,
  maxReschedulesPerAppointment: 3,
  autoConfirmBookings: true,
  checkinWindowMinutes: 30,
};

@Injectable()
export class AppointmentTransitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly notifications: NotificationStubService,
  ) {}

  async reschedule(actor: RequestUser, id: string, input: RescheduleAppointmentInput): Promise<AppointmentWithRelations> {
    const role = actor.roles[0] ?? "";
    if (!RESCHEDULE_ALLOWED_ROLES.has(role)) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const appointment = await loadAppointmentInScope(this.prisma, actor, id);
    assertNotTerminal(appointment);
    if (appointment.status === "CHECKED_IN" || appointment.status === "IN_PROGRESS") {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "Cannot reschedule after check-in.");
    }

    const policy = await this.loadPolicy(appointment.hospitalId);
    const now = new Date();
    const isSelfService = role === "PATIENT";
    checkWindow(appointment.startTime, now, policy.rescheduleWindowMinutes, isSelfService, input.overrideReason);
    assertRescheduleLimitNotExceeded(appointment.rescheduleCount, policy);

    const timezone = await getHospitalTimezone(this.prisma, appointment.hospitalId);
    const newStart = new Date(input.newStartTime);
    const dateOnly = DateTime.fromJSDate(newStart, { zone: "utc" }).setZone(timezone).toISODate()!;

    const availability = await this.availabilityService.computeForDoctor({
      doctorId: appointment.doctorId,
      departmentId: appointment.departmentId,
      from: dateOnly,
      to: dateOnly,
    });
    const matchedSlot = availability.days[0]?.slots.find((slot) => new Date(slot.startTime).getTime() === newStart.getTime());
    if (!matchedSlot) {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "This slot is not currently available.");
    }

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        const result = await tx.appointment.update({
          where: { id },
          data: {
            startTime: newStart,
            endTime: new Date(matchedSlot.endTime),
            rescheduleCount: { increment: 1 },
          },
          include: APPOINTMENT_INCLUDE,
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: id,
            action: "RESCHEDULED",
            performedBy: actor.sub,
            previousStartTime: appointment.startTime,
            newStartTime: newStart,
            reason: input.overrideReason,
          },
        });
        return result;
      });
      this.notifications.trigger("RESCHEDULED", id);
      return updated;
    } catch (error) {
      // docs/19-APPOINTMENT-ENGINE.md "Reschedule transaction": unlike a fresh
      // booking, a unique-constraint loss here maps to APPOINTMENT_NOT_AVAILABLE
      // (422), not APPOINTMENT_CONFLICT (409) — the original appointment is
      // untouched, this is "that slot isn't open" rather than "you lost a race
      // to create something new."
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "This slot is not currently available.");
      }
      throw error;
    }
  }

  async cancel(actor: RequestUser, id: string, input: CancelAppointmentInput): Promise<AppointmentWithRelations> {
    const role = actor.roles[0];
    const appointment = await loadAppointmentInScope(this.prisma, actor, id);
    assertNotTerminal(appointment);
    if (role === "PATIENT" && (appointment.status === "CHECKED_IN" || appointment.status === "IN_PROGRESS")) {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "Cannot cancel after check-in.");
    }

    const policy = await this.loadPolicy(appointment.hospitalId);
    const now = new Date();
    const isSelfService = role === "PATIENT";
    const isLate = checkWindow(appointment.startTime, now, policy.cancellationWindowMinutes, isSelfService, input.reason);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.appointment.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason, isLateCancellation: isLate },
        include: APPOINTMENT_INCLUDE,
      });
      await tx.appointmentHistory.create({ data: { appointmentId: id, action: "CANCELLED", performedBy: actor.sub, reason: input.reason } });
      return result;
    });
    this.notifications.trigger("CANCELLED", id);
    return updated;
  }

  async checkin(actor: RequestUser, id: string): Promise<AppointmentWithRelations> {
    const appointment = await loadAppointmentInScope(this.prisma, actor, id);
    assertNotTerminal(appointment);
    if (appointment.status !== "SCHEDULED" && appointment.status !== "CONFIRMED") {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "This appointment is already checked in.");
    }

    const policy = await this.loadPolicy(appointment.hospitalId);
    assertCheckinWindowOpen(appointment.startTime, new Date(), policy);

    const dayStart = new Date(appointment.startTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      // Per-(branch, department, day) queue counter — docs/19-APPOINTMENT-ENGINE.md
      // "Check-in / queueing concurrency": lock the existing checked-in rows for
      // that key so concurrent check-ins serialize on assigning the next number.
      const existing = await tx.$queryRaw<{ queueNumber: number | null }[]>`
        SELECT queue_number as "queueNumber" FROM appointments
        WHERE branch_id = ${appointment.branchId}::uuid
          AND department_id = ${appointment.departmentId}::uuid
          AND start_time >= ${dayStart}
          AND start_time < ${dayEnd}
          AND status IN ('CHECKED_IN','IN_PROGRESS','COMPLETED')
        FOR UPDATE`;
      const nextQueueNumber = existing.reduce((max, row) => Math.max(max, row.queueNumber ?? 0), 0) + 1;

      const result = await tx.appointment.update({
        where: { id },
        data: { status: "CHECKED_IN", checkedInAt: new Date(), queueNumber: nextQueueNumber },
        include: APPOINTMENT_INCLUDE,
      });
      await tx.appointmentHistory.create({ data: { appointmentId: id, action: "CHECKED_IN", performedBy: actor.sub } });
      return result;
    });
    this.notifications.trigger("CHECKED_IN", id);
    return updated;
  }

  async markNoShow(actor: RequestUser, id: string, input: MarkNoShowInput): Promise<AppointmentWithRelations> {
    const role = actor.roles[0] ?? "";
    if (!NO_SHOW_ALLOWED_ROLES.has(role)) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const appointment = await loadAppointmentInScope(this.prisma, actor, id);
    assertNotTerminal(appointment);
    if (appointment.status !== "SCHEDULED" && appointment.status !== "CONFIRMED") {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "Cannot mark no-show; this appointment already has a check-in.");
    }
    assertNoShowEligible(appointment.startTime, new Date());

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.appointment.update({
        where: { id },
        data: { status: "NO_SHOW" },
        include: APPOINTMENT_INCLUDE,
      });
      await tx.appointmentHistory.create({ data: { appointmentId: id, action: "NO_SHOW", performedBy: actor.sub, reason: input.reason } });
      return result;
    });
    this.notifications.trigger("NO_SHOW", id);
    return updated;
  }

  private async loadPolicy(hospitalId: string): Promise<BookingPolicy> {
    const settings = await this.prisma.client.hospitalSettings.findUnique({ where: { hospitalId } });
    return settings ?? DEFAULT_POLICY;
  }
}
