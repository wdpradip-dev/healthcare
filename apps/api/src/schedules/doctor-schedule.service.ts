import { Injectable } from "@nestjs/common";
import { DomainException } from "@hospital/shared";
import type { ReplaceDoctorScheduleInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { loadDoctorInScope, serializeDoctorSchedule, type SerializedDoctorSchedule } from "./schedule-access.util";

/**
 * `GET/PUT /schedules/:doctorId` — the weekly availability template
 * (docs/13-DATABASE-DESIGN.md "DoctorSchedule", docs/09-ADMIN-DESIGN-MOCKUPS.md
 * "Doctor Schedules"). `PUT` replaces the doctor's entire current template in
 * one call; there is no per-row create/update/delete route.
 */
@Injectable()
export class DoctorScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeeklyTemplate(actor: RequestUser, doctorId: string): Promise<SerializedDoctorSchedule[]> {
    await loadDoctorInScope(this.prisma, actor, doctorId);
    const rows = await this.prisma.client.doctorSchedule.findMany({
      where: { doctorId },
      include: { department: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return rows.map(serializeDoctorSchedule);
  }

  async replaceWeeklyTemplate(actor: RequestUser, doctorId: string, input: ReplaceDoctorScheduleInput): Promise<SerializedDoctorSchedule[]> {
    const doctor = await loadDoctorInScope(this.prisma, actor, doctorId);

    const assignedDepartmentIds = new Set(doctor.doctorDepartments.map((dd) => dd.department.id));
    for (const block of input.days) {
      if (!assignedDepartmentIds.has(block.departmentId)) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "days", message: "A schedule block's departmentId must be one this doctor is assigned to." },
        ]);
      }
    }
    assertNoOverlaps(input.days);

    const today = new Date().toISOString().slice(0, 10);
    await this.prisma.client.$transaction([
      this.prisma.client.doctorSchedule.deleteMany({ where: { doctorId } }),
      this.prisma.client.doctorSchedule.createMany({
        data: input.days.map((block) => ({
          hospitalId: doctor.hospitalId,
          doctorId,
          departmentId: block.departmentId,
          dayOfWeek: block.dayOfWeek,
          startTime: toTimeValue(block.startTime),
          endTime: toTimeValue(block.endTime),
          slotDurationMinutes: block.slotDurationMinutes,
          bufferMinutes: block.bufferMinutes,
          maxAppointments: block.maxAppointments,
          effectiveFrom: new Date(today),
          effectiveTo: null,
        })),
      }),
    ]);

    return this.getWeeklyTemplate(actor, doctorId);
  }
}

/** Overlap check per docs/13-DATABASE-DESIGN.md "DoctorSchedule": rejected at
 * the service layer, same (doctorId, dayOfWeek) — the caller already scopes
 * everything to one doctor, so this only needs to compare same-day blocks. */
function assertNoOverlaps(blocks: ReplaceDoctorScheduleInput["days"]): void {
  const byDay = new Map<number, ReplaceDoctorScheduleInput["days"]>();
  for (const block of blocks) {
    const existing = byDay.get(block.dayOfWeek) ?? [];
    for (const other of existing) {
      if (block.startTime < other.endTime && other.startTime < block.endTime) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "days", message: `Overlapping time ranges for day ${block.dayOfWeek}.` },
        ]);
      }
    }
    existing.push(block);
    byDay.set(block.dayOfWeek, existing);
  }
}

/** `@db.Time` columns round-trip through Prisma as a `Date` with an
 * arbitrary date component — 1970-01-01 is the conventional placeholder. */
function toTimeValue(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}
