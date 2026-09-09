import type { Doctor, Prisma, ScheduleException } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";

export type DoctorWithBranches = Doctor & {
  doctorDepartments: { department: { id: string; branchId: string } }[];
};

/**
 * `GET/PUT /schedules/:doctorId` and the `/exceptions` sub-routes always
 * target one specific doctor named in the path — this is the "can `actor`
 * reach this doctorId at all" check shared by both, per the `schedules.read`/
 * `write` scope matrix (docs/02-PERSONAS-AND-ROLES.md):
 *   PATIENT: none (their `schedules.read` is PLATFORM but explicitly
 *     "availability only" — blocked from the raw template/exceptions
 *     entirely, see docs/18-MULTI-TENANCY.md).
 *   DOCTOR: SELF only.
 *   NURSE/RECEPTIONIST: BRANCH, read-only (enforced here for read; write is
 *     already blocked at the guard since neither role holds `schedules.write`
 *     at all).
 *   ADMIN: HOSPITAL. SUPER_ADMIN: PLATFORM (no restriction).
 * Fails closed (404, never disambiguating "doesn't exist" from "exists but
 * out of scope" — docs/28-ERROR-HANDLING.md) for any role not listed above.
 */
export async function loadDoctorInScope(prisma: PrismaService, actor: RequestUser, doctorId: string): Promise<DoctorWithBranches> {
  const doctor: DoctorWithBranches | null = await prisma.client.doctor.findUnique({
    where: { id: doctorId },
    include: { doctorDepartments: { include: { department: { select: { id: true, branchId: true } } } } },
  });
  if (!doctor || doctor.deletedAt) {
    throw new DomainException("NOT_FOUND", "Doctor not found.");
  }

  const role = actor.roles[0];
  if (role === "SUPER_ADMIN") {
    return doctor;
  }
  if (role === "ADMIN") {
    if (doctor.hospitalId !== actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    return doctor;
  }
  if (role === "DOCTOR") {
    if (doctor.userId !== actor.sub) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    return doctor;
  }
  if (role === "NURSE" || role === "RECEPTIONIST") {
    if (doctor.hospitalId !== actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    const staff = await prisma.client.staff.findUnique({ where: { userId: actor.sub } });
    const doctorBranchIds = new Set(doctor.doctorDepartments.map((dd) => dd.department.branchId));
    if (staff?.branchId && !doctorBranchIds.has(staff.branchId)) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    return doctor;
  }

  // PATIENT and anything else — no visibility into the raw template/exceptions.
  throw new DomainException("NOT_FOUND", "Doctor not found.");
}

export type DoctorScheduleRow = Prisma.DoctorScheduleGetPayload<{ include: { department: true } }>;

/** Defaults to UTC if a hospital somehow has no `HospitalSettings` row —
 * defensive only; `HospitalsService.create()` (Phase 6) always provisions
 * one, so this should never actually apply outside of stale pre-fix data. */
export async function getHospitalTimezone(prisma: PrismaService, hospitalId: string): Promise<string> {
  const settings = await prisma.client.hospitalSettings.findUnique({ where: { hospitalId }, select: { timezone: true } });
  return settings?.timezone ?? "UTC";
}

/** `@db.Time` round-trips through Prisma as a full `Date` (1970-01-01 date
 * component) — API responses should carry the wall-clock "HH:MM" a client
 * actually asked for, not a raw ISO instant with a meaningless date. */
export function toHHMM(value: Date): string {
  return value.toISOString().slice(11, 16);
}

/** Same idea for `@db.Date` columns — "YYYY-MM-DD", no time-of-day noise. */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type SerializedDoctorSchedule = Omit<DoctorScheduleRow, "startTime" | "endTime" | "effectiveFrom" | "effectiveTo"> & {
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function serializeDoctorSchedule(row: DoctorScheduleRow): SerializedDoctorSchedule {
  return {
    ...row,
    startTime: toHHMM(row.startTime),
    endTime: toHHMM(row.endTime),
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toDateOnly(row.effectiveTo) : null,
  };
}

export type SerializedScheduleException = Omit<ScheduleException, "startDate" | "endDate" | "startTime" | "endTime"> & {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
};

export function serializeScheduleException(row: ScheduleException): SerializedScheduleException {
  return {
    ...row,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    startTime: row.startTime ? toHHMM(row.startTime) : null,
    endTime: row.endTime ? toHHMM(row.endTime) : null,
  };
}
