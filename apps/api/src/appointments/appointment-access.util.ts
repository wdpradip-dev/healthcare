import type { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";

/** Non-terminal per docs/19-APPOINTMENT-ENGINE.md — the set covered by the
 * partial unique index and by every "is this slot/day still open" check. */
export const NON_TERMINAL_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] as const;

/** `CANCELLED`/`COMPLETED`/`NO_SHOW` — no further transition is ever valid
 * from any of these (docs/28-ERROR-HANDLING.md `APPOINTMENT_CANCELLED`). */
export const TERMINAL_APPOINTMENT_STATUSES = ["CANCELLED", "COMPLETED", "NO_SHOW"] as const;

export const APPOINTMENT_INCLUDE = { doctor: { include: { user: true } }, patient: { include: { user: true } } } as const satisfies Prisma.AppointmentInclude;

type AppointmentPayload = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

// GetPayload's static type doesn't know about the client-wide passwordHash
// default (packages/database/src/client.ts) — Omit<..., "user"> here matches
// what the query actually returns at runtime (see patients.service.ts's
// identical PatientWithUser for the established precedent).
export type AppointmentWithRelations = Omit<AppointmentPayload, "doctor" | "patient"> & {
  doctor: Omit<AppointmentPayload["doctor"], "user"> & { user: Omit<AppointmentPayload["doctor"]["user"], "passwordHash"> };
  patient: Omit<AppointmentPayload["patient"], "user"> & { user: Omit<AppointmentPayload["patient"]["user"], "passwordHash"> };
};

/**
 * `appointments.read`'s per-role scope (docs/02-PERSONAS-AND-ROLES.md), used
 * as the read gate for `GET /appointments/:id` and as the prerequisite check
 * before every mutation (reschedule/cancel/checkin/no-show) — you must be
 * able to see an appointment before any sub-action-specific role rule (in the
 * calling service) is even evaluated. Fails closed: 404, never disambiguating
 * "doesn't exist" from "exists but out of scope."
 */
export async function loadAppointmentInScope(prisma: PrismaService, actor: RequestUser, appointmentId: string): Promise<AppointmentWithRelations> {
  const appointment = await prisma.client.appointment.findUnique({ where: { id: appointmentId }, include: APPOINTMENT_INCLUDE });
  if (!appointment) {
    throw new DomainException("NOT_FOUND", "Appointment not found.");
  }

  const role = actor.roles[0];
  if (role === "SUPER_ADMIN") {
    return appointment;
  }
  if (role === "ADMIN") {
    if (appointment.hospitalId !== actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    return appointment;
  }
  if (role === "NURSE" || role === "RECEPTIONIST") {
    if (appointment.hospitalId !== actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    const staff = await prisma.client.staff.findUnique({ where: { userId: actor.sub } });
    if (!staff?.branchId || appointment.branchId !== staff.branchId) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    return appointment;
  }
  if (role === "DOCTOR") {
    if (appointment.doctor.userId !== actor.sub) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    return appointment;
  }
  if (role === "PATIENT") {
    if (appointment.patient.userId !== actor.sub) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    return appointment;
  }

  throw new DomainException("NOT_FOUND", "Appointment not found.");
}

/** The caller's own `Patient.id` — only meaningful for a `PATIENT` actor. */
export async function getActorPatientId(prisma: PrismaService, actor: RequestUser): Promise<string> {
  const patient = await prisma.client.patient.findUnique({ where: { userId: actor.sub } });
  if (!patient) {
    throw new DomainException("NOT_FOUND", "Patient profile not found.");
  }
  return patient.id;
}

/** The caller's own `Staff.branchId` — only meaningful for a `NURSE`/`RECEPTIONIST` actor. */
export async function getActorBranchId(prisma: PrismaService, actor: RequestUser): Promise<string | null> {
  const staff = await prisma.client.staff.findUnique({ where: { userId: actor.sub } });
  return staff?.branchId ?? null;
}

export function assertNotTerminal(appointment: { status: string }): void {
  if ((TERMINAL_APPOINTMENT_STATUSES as readonly string[]).includes(appointment.status)) {
    throw new DomainException("APPOINTMENT_CANCELLED", "This appointment is already in a terminal state.");
  }
}
