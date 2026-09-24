import { Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { CreateAppointmentInput, ListAppointmentsQuery } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";
import { getHospitalTimezone } from "../schedules/schedule-access.util";
import { AvailabilityService } from "../schedules/availability.service";
import { APPOINTMENT_INCLUDE, getActorBranchId, getActorPatientId, loadAppointmentInScope, type AppointmentWithRelations } from "./appointment-access.util";
import { assertWithinBookingWindow, type BookingPolicy } from "./appointment-policy.util";
import { NotificationStubService } from "./notification-stub.service";

const LIST_INCLUDE = { ...APPOINTMENT_INCLUDE, department: true, branch: true } satisfies Prisma.AppointmentInclude;
const DETAIL_INCLUDE = { ...APPOINTMENT_INCLUDE, department: true, branch: true, history: { orderBy: { performedAt: "asc" } } } satisfies Prisma.AppointmentInclude;

// Same passwordHash-omit fix as AppointmentWithRelations (appointment-access.util.ts) —
// GetPayload's static type doesn't know about the client-wide `omit` default.
type AppointmentListPayload = Prisma.AppointmentGetPayload<{ include: typeof LIST_INCLUDE }>;
export type AppointmentListRow = Omit<AppointmentListPayload, "doctor" | "patient"> & {
  doctor: Omit<AppointmentListPayload["doctor"], "user"> & { user: Omit<AppointmentListPayload["doctor"]["user"], "passwordHash"> };
  patient: Omit<AppointmentListPayload["patient"], "user"> & { user: Omit<AppointmentListPayload["patient"]["user"], "passwordHash"> };
};

type AppointmentDetailPayload = Prisma.AppointmentGetPayload<{ include: typeof DETAIL_INCLUDE }>;
export type AppointmentDetailRow = Omit<AppointmentDetailPayload, "doctor" | "patient"> & {
  doctor: Omit<AppointmentDetailPayload["doctor"], "user"> & { user: Omit<AppointmentDetailPayload["doctor"]["user"], "passwordHash"> };
  patient: Omit<AppointmentDetailPayload["patient"], "user"> & { user: Omit<AppointmentDetailPayload["patient"]["user"], "passwordHash"> };
};

/**
 * `/appointments` — list/detail/booking. Reschedule/cancel/checkin/no-show
 * live in `appointment-transitions.service.ts` (docs/15-API-SPECIFICATION.md
 * splits these across five routes; this file owns the two read routes plus
 * `POST /appointments`, the one genuinely new-row-creating action).
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly notifications: NotificationStubService,
  ) {}

  async list(actor: RequestUser, query: ListAppointmentsQuery): Promise<AppointmentListRow[]> {
    const where = await this.resolveListWhere(actor, query);
    if (where === "NONE") {
      return [];
    }
    return this.prisma.client.appointment.findMany({ where, include: LIST_INCLUDE, orderBy: { startTime: "asc" } });
  }

  async getById(actor: RequestUser, id: string): Promise<AppointmentDetailRow> {
    await loadAppointmentInScope(this.prisma, actor, id);
    return this.prisma.client.appointment.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
  }

  async create(actor: RequestUser, input: CreateAppointmentInput): Promise<AppointmentWithRelations> {
    const role = actor.roles[0];

    const doctor = await this.prisma.client.doctor.findUnique({
      where: { id: input.doctorId },
      include: { doctorDepartments: { include: { department: true } } },
    });
    if (!doctor || doctor.deletedAt || doctor.status !== "ACTIVE") {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    if ((role === "ADMIN" || role === "RECEPTIONIST") && doctor.hospitalId !== resolveHospitalId(actor, input.hospitalId)) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }

    const assignment = doctor.doctorDepartments.find((dd) => dd.departmentId === input.departmentId);
    if (!assignment) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "departmentId", message: "This doctor is not assigned to that department." },
      ]);
    }
    const branchId = assignment.department.branchId;

    let patientId: string;
    if (role === "PATIENT") {
      // Never trust a client-supplied patientId for a self-service booking —
      // same "own scope always wins" rule as every other Phase 5/6 module.
      patientId = await getActorPatientId(this.prisma, actor);
    } else {
      if (!input.patientId) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "patientId", message: "Required when booking on a patient's behalf." },
        ]);
      }
      const patient = await this.prisma.client.patient.findUnique({ where: { id: input.patientId } });
      if (!patient) {
        throw new DomainException("NOT_FOUND", "Patient not found.");
      }
      if (role === "RECEPTIONIST" || role === "NURSE") {
        // Fail closed on a null branchId (an unassigned Staff row is a real,
        // reachable state — docs/13-DATABASE-DESIGN.md's Staff.branchId is
        // nullable) — same as loadAppointmentInScope()/resolveListWhere()'s
        // BRANCH-scope checks elsewhere in this module. A permissive `&&`
        // here would let an unassigned Receptionist book against any branch
        // in the hospital instead of none, defeating BRANCH scope.
        const staffBranchId = await getActorBranchId(this.prisma, actor);
        if (!staffBranchId || staffBranchId !== branchId) {
          throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
            { field: "doctorId", message: "This doctor is not at your assigned branch." },
          ]);
        }
      }
      patientId = patient.id;
    }

    const settings = await this.prisma.client.hospitalSettings.findUnique({ where: { hospitalId: doctor.hospitalId } });
    const policy: BookingPolicy = settings ?? DEFAULT_POLICY;
    const timezone = await getHospitalTimezone(this.prisma, doctor.hospitalId);

    const requestedStart = new Date(input.startTime);
    const now = new Date();
    assertWithinBookingWindow(requestedStart, now, policy);

    const dateOnly = DateTime.fromJSDate(requestedStart, { zone: "utc" }).setZone(timezone).toISODate()!;
    const availability = await this.availabilityService.computeForDoctor({
      doctorId: input.doctorId,
      departmentId: input.departmentId,
      from: dateOnly,
      to: dateOnly,
    });
    const matchedSlot = availability.days[0]?.slots.find((slot) => new Date(slot.startTime).getTime() === requestedStart.getTime());
    if (!matchedSlot) {
      throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "This slot is not currently available.");
    }

    const dayOfWeek = new Date(`${dateOnly}T00:00:00Z`).getUTCDay();
    const block = await this.prisma.client.doctorSchedule.findFirst({
      where: {
        doctorId: input.doctorId,
        departmentId: input.departmentId,
        dayOfWeek,
        effectiveFrom: { lte: new Date(`${dateOnly}T00:00:00Z`) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${dateOnly}T00:00:00Z`) } }],
      },
    });

    const status = policy.autoConfirmBookings ? "CONFIRMED" : "SCHEDULED";
    const endTime = new Date(matchedSlot.endTime);

    try {
      const appointment = await this.prisma.client.$transaction(async (tx) => {
        if (block?.maxAppointments != null) {
          const dayStart = new Date(`${dateOnly}T00:00:00.000Z`);
          const dayEnd = new Date(dayStart);
          dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
          // Row-level lock over the doctor's existing non-terminal appointments
          // that day, mirroring docs/19-APPOINTMENT-ENGINE.md's check-in queue
          // pattern ("SELECT ... FOR UPDATE" over the existing rows in scope).
          // Same caveat as that pattern: if zero rows currently exist there is
          // nothing yet to lock, so two *simultaneous first bookings* of the
          // day cannot be serialized by this alone — the partial unique index
          // is what makes the same-exact-slot case airtight regardless.
          const existing = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM appointments
            WHERE doctor_id = ${input.doctorId}::uuid
              AND start_time >= ${dayStart}
              AND start_time < ${dayEnd}
              AND status IN ('SCHEDULED','CONFIRMED','CHECKED_IN','IN_PROGRESS')
            FOR UPDATE`;
          if (existing.length >= block.maxAppointments) {
            throw new DomainException("APPOINTMENT_NOT_AVAILABLE", "This doctor has no remaining appointment capacity that day.");
          }
        }

        const created = await tx.appointment.create({
          data: {
            hospitalId: doctor.hospitalId,
            branchId,
            departmentId: input.departmentId,
            doctorId: input.doctorId,
            patientId,
            startTime: requestedStart,
            endTime,
            status,
            reason: input.reason,
            createdBy: actor.sub,
          },
          include: APPOINTMENT_INCLUDE,
        });

        await tx.appointmentHistory.create({
          data: { appointmentId: created.id, action: "CREATED", performedBy: actor.sub, newStartTime: created.startTime },
        });
        return created;
      });

      this.notifications.trigger("BOOKED", appointment.id);
      return appointment;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException("APPOINTMENT_CONFLICT", "This slot is no longer available.");
      }
      throw error;
    }
  }

  private async resolveListWhere(actor: RequestUser, query: ListAppointmentsQuery): Promise<Prisma.AppointmentWhereInput | "NONE"> {
    const role = actor.roles[0];
    const dateFilter = buildDateFilter(query.from, query.to);
    const baseFilters: Prisma.AppointmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...dateFilter,
    };

    if (role === "PATIENT") {
      const patientId = await getActorPatientId(this.prisma, actor);
      return { ...baseFilters, patientId };
    }
    if (role === "DOCTOR") {
      const doctor = await this.prisma.client.doctor.findUnique({ where: { userId: actor.sub } });
      if (!doctor) {
        return "NONE";
      }
      return { ...baseFilters, doctorId: doctor.id };
    }
    if (role === "NURSE" || role === "RECEPTIONIST") {
      const branchId = await getActorBranchId(this.prisma, actor);
      if (!branchId) {
        return "NONE";
      }
      return { ...baseFilters, hospitalId: actor.hospitalId ?? undefined, branchId, ...(query.patientId ? { patientId: query.patientId } : {}) };
    }
    if (role === "ADMIN") {
      const hospitalId = resolveHospitalId(actor, query.hospitalId);
      return {
        ...baseFilters,
        hospitalId,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
      };
    }
    // SUPER_ADMIN: PLATFORM — hospitalId narrows only if supplied.
    return {
      ...baseFilters,
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
    };
  }
}

const DEFAULT_POLICY: BookingPolicy = {
  minBookingLeadMinutes: 60,
  maxAdvanceBookingDays: 60,
  cancellationWindowMinutes: 120,
  rescheduleWindowMinutes: 120,
  maxReschedulesPerAppointment: 3,
  autoConfirmBookings: true,
  checkinWindowMinutes: 30,
};

function buildDateFilter(from: string | undefined, to: string | undefined): Prisma.AppointmentWhereInput {
  if (!from && !to) {
    return {};
  }
  return {
    startTime: {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lt: shiftDays(to, 1) } : {}),
    },
  };
}

function shiftDays(dateOnly: string, deltaDays: number): Date {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date;
}
