import { Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { DomainException } from "@hospital/shared";
import type { CreateScheduleExceptionInput, ListScheduleExceptionsQuery } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import {
  getHospitalTimezone,
  loadDoctorInScope,
  serializeScheduleException,
  type SerializedScheduleException,
} from "./schedule-access.util";

const NON_TERMINAL_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;

/**
 * `GET/POST /schedules/:doctorId/exceptions`, `DELETE .../exceptions/:id` —
 * one-off overrides (docs/13-DATABASE-DESIGN.md "ScheduleException").
 */
@Injectable()
export class ScheduleExceptionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: RequestUser, doctorId: string, query: ListScheduleExceptionsQuery): Promise<SerializedScheduleException[]> {
    await loadDoctorInScope(this.prisma, actor, doctorId);
    const rows = await this.prisma.client.scheduleException.findMany({
      where: {
        doctorId,
        ...(query.from ? { endDate: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { startDate: { lte: new Date(query.to) } } : {}),
      },
      orderBy: { startDate: "asc" },
    });
    return rows.map(serializeScheduleException);
  }

  async create(actor: RequestUser, doctorId: string, input: CreateScheduleExceptionInput): Promise<SerializedScheduleException> {
    const doctor = await loadDoctorInScope(this.prisma, actor, doctorId);

    await this.assertNoAffectedAppointments(doctor.hospitalId, doctorId, input);

    const row = await this.prisma.client.scheduleException.create({
      data: {
        hospitalId: doctor.hospitalId,
        doctorId,
        type: input.type,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        startTime: input.startTime ? toTimeValue(input.startTime) : null,
        endTime: input.endTime ? toTimeValue(input.endTime) : null,
        reason: input.reason,
        createdBy: actor.sub,
      },
    });
    return serializeScheduleException(row);
  }

  async remove(actor: RequestUser, doctorId: string, exceptionId: string): Promise<{ success: true }> {
    await loadDoctorInScope(this.prisma, actor, doctorId);
    const existing = await this.prisma.client.scheduleException.findUnique({ where: { id: exceptionId } });
    if (!existing || existing.doctorId !== doctorId) {
      throw new DomainException("NOT_FOUND", "Schedule exception not found.");
    }
    await this.prisma.client.scheduleException.delete({ where: { id: exceptionId } });
    return { success: true };
  }

  /**
   * docs/09-ADMIN-DESIGN-MOCKUPS.md "Schedule Exceptions": "Creating a
   * past-dated-conflict exception forces the admin to resolve existing
   * appointments in that window before saving." The mockup's "Notify &
   * Reschedule"/"Notify & Cancel" resolution UI needs Appointment
   * reschedule/cancel endpoints that don't exist until Phase 7 — until then,
   * this table is always empty, so this check always passes; the logic is
   * still real and correct today, not a Phase 7 stub.
   */
  private async assertNoAffectedAppointments(hospitalId: string, doctorId: string, input: CreateScheduleExceptionInput): Promise<void> {
    const timezone = await getHospitalTimezone(this.prisma, hospitalId);
    const startTime = input.startTime ?? "00:00";
    const endTime = input.endTime ?? "23:59";
    const rangeStart = DateTime.fromISO(`${input.startDate}T${startTime}:00`, { zone: timezone }).toJSDate();
    const rangeEnd = DateTime.fromISO(`${input.endDate}T${endTime}:59`, { zone: timezone }).toJSDate();

    const affected = await this.prisma.client.appointment.count({
      where: {
        doctorId,
        status: { in: [...NON_TERMINAL_APPOINTMENT_STATUSES] },
        startTime: { gte: rangeStart, lte: rangeEnd },
      },
    });
    if (affected > 0) {
      throw new DomainException("SCHEDULE_EXCEPTION_CONFLICT", `${affected} existing appointment(s) fall within this window.`);
    }
  }
}

function toTimeValue(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}
