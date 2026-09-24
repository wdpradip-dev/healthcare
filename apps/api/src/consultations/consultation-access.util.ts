import type { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { getActorBranchId } from "../appointments/appointment-access.util";

// `select` (not `include: { user: true }`) on the nested users: only a name is
// ever needed, and it keeps `passwordHash` out of the payload type entirely.
export const CONSULTATION_INCLUDE = {
  appointment: { select: { id: true, startTime: true, branchId: true, department: { select: { id: true, name: true } } } },
  doctor: { select: { id: true, userId: true, user: { select: { id: true, name: true } } } },
  patient: { select: { id: true, userId: true, user: { select: { id: true, name: true } } } },
  clinicalNotes: { orderBy: { createdAt: "asc" } },
  diagnoses: { orderBy: { createdAt: "asc" } },
  vitals: { orderBy: { recordedAt: "asc" } },
} satisfies Prisma.ConsultationInclude;

export type ConsultationDetail = Prisma.ConsultationGetPayload<{ include: typeof CONSULTATION_INCLUDE }>;

/** Roles that may see `isInternal` clinician notes (docs/13 ClinicalNote,
 * docs/15 "internal notes stripped for non-clinical viewers"). Admin and
 * Patient are both non-clinical; Super Admin is treated the same (support
 * access to clinical content is break-glass, docs/25-SECURITY.md). */
const CLINICAL_VIEWER_ROLES = new Set(["DOCTOR", "NURSE"]);

export function isClinicalViewer(actor: RequestUser): boolean {
  return CLINICAL_VIEWER_ROLES.has(actor.roles[0] ?? "");
}

export function stripInternalNotes(consultation: ConsultationDetail, actor: RequestUser): ConsultationDetail {
  if (isClinicalViewer(actor)) {
    return consultation;
  }
  return { ...consultation, clinicalNotes: consultation.clinicalNotes.filter((note) => !note.isInternal) };
}

/**
 * `consultations.read`'s per-role scope (docs/02): PATIENT self, DOCTOR
 * assigned (the treating doctor), NURSE branch (the appointment's branch),
 * ADMIN hospital, SUPER_ADMIN platform. Fails closed with a non-disambiguating
 * 404, and is the prerequisite gate for every consultation mutation. A
 * patient additionally never sees a consultation that is still in progress
 * (a draft, not yet a record).
 */
export async function loadConsultationInScope(prisma: PrismaService, actor: RequestUser, id: string): Promise<ConsultationDetail> {
  const consultation = await prisma.client.consultation.findUnique({ where: { id }, include: CONSULTATION_INCLUDE });
  if (!consultation) {
    throw new DomainException("NOT_FOUND", "Consultation not found.");
  }

  const role = actor.roles[0];
  if (role === "SUPER_ADMIN") {
    return consultation;
  }
  if (role === "ADMIN") {
    if (consultation.hospitalId !== actor.hospitalId) {
      throw new DomainException("NOT_FOUND", "Consultation not found.");
    }
    return consultation;
  }
  if (role === "NURSE") {
    const branchId = await getActorBranchId(prisma, actor);
    if (consultation.hospitalId !== actor.hospitalId || !branchId || consultation.appointment.branchId !== branchId) {
      throw new DomainException("NOT_FOUND", "Consultation not found.");
    }
    return consultation;
  }
  if (role === "DOCTOR") {
    if (consultation.doctor.userId !== actor.sub) {
      throw new DomainException("NOT_FOUND", "Consultation not found.");
    }
    return consultation;
  }
  if (role === "PATIENT") {
    if (consultation.patient.userId !== actor.sub || consultation.status !== "COMPLETED") {
      throw new DomainException("NOT_FOUND", "Consultation not found.");
    }
    return consultation;
  }

  throw new DomainException("NOT_FOUND", "Consultation not found.");
}
