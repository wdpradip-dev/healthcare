import { DomainException } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { getActorBranchId, getActorPatientId } from "../appointments/appointment-access.util";

/** Whose clinical records a request is about, and which hospital's rows of theirs the caller may see. */
export interface ClinicalSubject {
  patientId: string;
  /** undefined = every hospital (the patient themself, or a Super Admin who didn't narrow). */
  hospitalId?: string;
}

/**
 * The shared "which patient, which hospital" gate behind every clinical read
 * (medical records, prescriptions, reports, documents, lab orders) — docs/18's
 * two-constraint shape. PATIENT: always themself (a supplied patientId is
 * ignored, never trusted). Staff must name a patient, and: DOCTOR needs an
 * actual appointment with them (own hospital's rows only), NURSE an
 * appointment at their branch, ADMIN own hospital, SUPER_ADMIN platform.
 * Everything else — including any missing Staff/Doctor row or null
 * branch/hospital — fails closed as NOT_FOUND.
 */
export async function resolveClinicalSubject(
  prisma: PrismaService,
  actor: RequestUser,
  query: { patientId?: string; hospitalId?: string },
): Promise<ClinicalSubject> {
  const role = actor.roles[0];

  if (role === "PATIENT") {
    return { patientId: await getActorPatientId(prisma, actor), hospitalId: query.hospitalId };
  }

  if (!query.patientId) {
    throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "patientId", message: "patientId is required." }]);
  }
  const patient = await prisma.client.patient.findUnique({ where: { id: query.patientId } });
  if (!patient) {
    throw new DomainException("NOT_FOUND", "Patient not found.");
  }

  if (role === "SUPER_ADMIN") {
    return { patientId: patient.id, hospitalId: query.hospitalId };
  }
  if (role === "ADMIN") {
    if (!actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    return { patientId: patient.id, hospitalId: actor.hospitalId };
  }
  if (role === "DOCTOR") {
    const doctor = await prisma.client.doctor.findUnique({ where: { userId: actor.sub } });
    const related = doctor ? await prisma.client.appointment.count({ where: { doctorId: doctor.id, patientId: patient.id } }) : 0;
    if (!doctor || related === 0) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    return { patientId: patient.id, hospitalId: doctor.hospitalId };
  }
  if (role === "NURSE") {
    const branchId = await getActorBranchId(prisma, actor);
    const related = branchId ? await prisma.client.appointment.count({ where: { branchId, patientId: patient.id } }) : 0;
    if (!branchId || related === 0 || !actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    return { patientId: patient.id, hospitalId: actor.hospitalId };
  }

  throw new DomainException("NOT_FOUND", "Patient not found.");
}
