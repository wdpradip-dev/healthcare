import type { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { getActorBranchId, getActorPatientId } from "../appointments/appointment-access.util";

/**
 * A caller's read scope over patient-linked clinical rows, expressed as
 * filters the caller's service maps onto its own table (docs/18's
 * two-constraint shape): which patients (`patientId`/`patientFilter`) and
 * which hospital's rows (`hospitalId`). PATIENT: self. DOCTOR: patients they
 * have an appointment with, their hospital's rows. NURSE: patients with an
 * appointment at their branch. ADMIN: own hospital. SUPER_ADMIN: platform.
 * A missing Doctor/Staff row or null hospital/branch fails closed (NOT_FOUND).
 */
export interface ClinicalScope {
  patientId?: string;
  patientFilter?: Prisma.PatientWhereInput;
  hospitalId?: string;
}

export async function resolveClinicalScope(
  prisma: PrismaService,
  actor: RequestUser,
  query: { patientId?: string; hospitalId?: string } = {},
): Promise<ClinicalScope> {
  const role = actor.roles[0];
  const notFound = () => new DomainException("NOT_FOUND", "Not found.");

  if (role === "PATIENT") {
    return { patientId: await getActorPatientId(prisma, actor), hospitalId: query.hospitalId };
  }
  if (role === "SUPER_ADMIN") {
    return { patientId: query.patientId, hospitalId: query.hospitalId };
  }
  if (role === "ADMIN") {
    if (!actor.hospitalId) throw notFound();
    return { patientId: query.patientId, hospitalId: actor.hospitalId };
  }
  if (role === "DOCTOR") {
    const doctor = await prisma.client.doctor.findUnique({ where: { userId: actor.sub } });
    if (!doctor) throw notFound();
    return {
      patientId: query.patientId,
      patientFilter: { appointments: { some: { doctorId: doctor.id } } },
      hospitalId: doctor.hospitalId,
    };
  }
  if (role === "NURSE") {
    const branchId = await getActorBranchId(prisma, actor);
    if (!branchId || !actor.hospitalId) throw notFound();
    return {
      patientId: query.patientId,
      patientFilter: { appointments: { some: { branchId } } },
      hospitalId: actor.hospitalId,
    };
  }
  throw notFound();
}
