import { Injectable } from "@nestjs/common";
import { DomainException } from "@hospital/shared";
import type { AvailabilityQuery } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { computeAvailability, type AvailabilityException, type AvailabilityResult, type AvailabilityScheduleBlock } from "./availability.util";
import { getHospitalTimezone } from "./schedule-access.util";

const NON_TERMINAL_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;

/**
 * `GET /schedules/availability` — open discovery, per docs/02's matrix
 * `schedules.read` is `PLATFORM` for both `PATIENT` and `SUPER_ADMIN` (and
 * every other role holding `schedules.read` at all may use it too); unlike
 * the raw template/exceptions routes, there is no per-role narrowing here —
 * see `schedule-access.util.ts`'s docstring for why those two are different.
 * All the actual computation is `availability.util.ts`'s pure function; this
 * service only fetches and shapes the DB rows it needs.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async computeForDoctor(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const doctor = await this.prisma.client.doctor.findUnique({
      where: { id: query.doctorId },
      include: { doctorDepartments: { include: { department: { select: { id: true, branchId: true } } } } },
    });
    if (!doctor || doctor.deletedAt) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }

    const timezone = await getHospitalTimezone(this.prisma, doctor.hospitalId);
    const branchIds = doctor.doctorDepartments.map((dd) => dd.department.branchId);
    const branchIdByDepartmentId = new Map(doctor.doctorDepartments.map((dd) => [dd.department.id, dd.department.branchId]));

    const scheduleRows = await this.prisma.client.doctorSchedule.findMany({
      where: {
        doctorId: query.doctorId,
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        effectiveFrom: { lte: new Date(query.to) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(query.from) } }],
      },
    });

    const exceptionRows = await this.prisma.client.scheduleException.findMany({
      where: {
        hospitalId: doctor.hospitalId,
        OR: [{ doctorId: query.doctorId }, { doctorId: null, branchId: { in: branchIds } }],
        startDate: { lte: new Date(query.to) },
        endDate: { gte: new Date(query.from) },
      },
    });

    // Padded a day on each side of the UTC bound: `from`/`to` are calendar
    // dates in the hospital's own timezone, which rarely aligns with UTC
    // midnight — this is only a candidate-set pre-filter (the pure function
    // does the exact ISO-instant match against generated slots), so
    // over-fetching here is harmless and under-fetching would be a bug.
    const appointmentRows = await this.prisma.client.appointment.findMany({
      where: {
        doctorId: query.doctorId,
        status: { in: [...NON_TERMINAL_APPOINTMENT_STATUSES] },
        startTime: { gte: shiftDays(query.from, -1), lte: shiftDays(query.to, 1) },
      },
      select: { startTime: true },
    });

    const schedules: AvailabilityScheduleBlock[] = scheduleRows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: toHHMM(row.startTime),
      endTime: toHHMM(row.endTime),
      slotDurationMinutes: row.slotDurationMinutes,
      bufferMinutes: row.bufferMinutes,
      maxAppointments: row.maxAppointments,
      effectiveFrom: toDateOnly(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toDateOnly(row.effectiveTo) : null,
      branchId: branchIdByDepartmentId.get(row.departmentId) ?? "",
    }));

    const exceptions: AvailabilityException[] = exceptionRows.map((row) => ({
      type: row.type,
      startDate: toDateOnly(row.startDate),
      endDate: toDateOnly(row.endDate),
      startTime: row.startTime ? toHHMM(row.startTime) : null,
      endTime: row.endTime ? toHHMM(row.endTime) : null,
      doctorId: row.doctorId,
      branchId: row.branchId,
    }));

    return computeAvailability({
      doctorId: query.doctorId,
      timezone,
      from: query.from,
      to: query.to,
      schedules,
      exceptions,
      bookedStartTimesIso: appointmentRows.map((a) => a.startTime.toISOString()),
    });
  }
}

function toHHMM(value: Date): string {
  return value.toISOString().slice(11, 16);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(dateOnly: string, deltaDays: number): Date {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date;
}
