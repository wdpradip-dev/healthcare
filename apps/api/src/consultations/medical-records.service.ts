import { Injectable } from "@nestjs/common";
import type { Allergy, MedicalCondition } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type {
  CreateAllergyInput,
  CreateConditionInput,
  ListMedicalRecordsQuery,
  MedicalRecordsSubjectQuery,
} from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { resolveClinicalSubject, type ClinicalSubject } from "./clinical-subject.util";

export interface MedicalRecordEntry {
  type: "CONSULTATION";
  id: string;
  date: Date | null;
  hospitalId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  doctor: { id: string; name: string };
  department: string | null;
  diagnoses: { icd10Code: string | null; description: string }[];
}

export interface MedicalRecordsSummary {
  patientId: string;
  activeConditions: MedicalCondition[];
  allergies: Allergy[];
  consultationCount: number;
  recentConsultations: MedicalRecordEntry[];
  activePrescriptionCount: number;
}

const ENTRY_INCLUDE = {
  doctor: { select: { id: true, user: { select: { name: true } } } },
  appointment: { select: { department: { select: { name: true } } } },
  diagnoses: { select: { icd10Code: true, description: true }, orderBy: { createdAt: "asc" } },
} as const;

/**
 * `/medical-records` — docs/15. Patient identity is platform-level but every
 * clinical row is hospital-scoped (docs/18-MULTI-TENANCY.md), so each role's
 * access is two independent constraints: *which patient* (PATIENT: self;
 * DOCTOR: someone they have an appointment with; NURSE: someone with an
 * appointment at their branch; ADMIN: any patient) and *which hospital's rows*
 * (PATIENT: all of their own; staff: their own hospital only).
 */
@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(actor: RequestUser, query: MedicalRecordsSubjectQuery): Promise<MedicalRecordsSummary> {
    const subject = await this.resolveSubject(actor, query);
    const hospitalWhere = subject.hospitalId ? { hospitalId: subject.hospitalId } : {};
    const visibility = this.consultationVisibility(actor);

    const [conditions, allergies, consultationCount, recent, activePrescriptionCount] = await Promise.all([
      this.prisma.client.medicalCondition.findMany({
        where: { patientId: subject.patientId, ...hospitalWhere, status: { in: ["ACTIVE", "CHRONIC"] } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.client.allergy.findMany({ where: { patientId: subject.patientId, ...hospitalWhere }, orderBy: { recordedAt: "desc" } }),
      this.prisma.client.consultation.count({ where: { patientId: subject.patientId, ...hospitalWhere, ...visibility } }),
      this.prisma.client.consultation.findMany({
        where: { patientId: subject.patientId, ...hospitalWhere, ...visibility },
        include: ENTRY_INCLUDE,
        orderBy: { startedAt: "desc" },
        take: 3,
      }),
      this.prisma.client.prescription.count({ where: { patientId: subject.patientId, ...hospitalWhere, status: "ACTIVE" } }),
    ]);

    return {
      patientId: subject.patientId,
      activeConditions: conditions,
      allergies,
      consultationCount,
      recentConsultations: recent.map(toEntry),
      activePrescriptionCount,
    };
  }

  async list(actor: RequestUser, query: ListMedicalRecordsQuery): Promise<MedicalRecordEntry[]> {
    const subject = await this.resolveSubject(actor, query);
    const rows = await this.prisma.client.consultation.findMany({
      where: {
        patientId: subject.patientId,
        ...(subject.hospitalId ? { hospitalId: subject.hospitalId } : {}),
        ...this.consultationVisibility(actor),
        ...(query.from || query.to
          ? {
              startedAt: {
                ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
                ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
              },
            }
          : {}),
      },
      include: ENTRY_INCLUDE,
      orderBy: { startedAt: "desc" },
    });
    return rows.map(toEntry);
  }

  async listConditions(actor: RequestUser, query: MedicalRecordsSubjectQuery): Promise<MedicalCondition[]> {
    const subject = await this.resolveSubject(actor, query);
    return this.prisma.client.medicalCondition.findMany({
      where: { patientId: subject.patientId, ...(subject.hospitalId ? { hospitalId: subject.hospitalId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async listAllergies(actor: RequestUser, query: MedicalRecordsSubjectQuery): Promise<Allergy[]> {
    const subject = await this.resolveSubject(actor, query);
    return this.prisma.client.allergy.findMany({
      where: { patientId: subject.patientId, ...(subject.hospitalId ? { hospitalId: subject.hospitalId } : {}) },
      orderBy: { recordedAt: "desc" },
    });
  }

  async createCondition(actor: RequestUser, input: CreateConditionInput): Promise<MedicalCondition> {
    const subject = await this.resolveWriteSubject(actor, input.patientId);
    return this.prisma.client.medicalCondition.create({
      data: {
        patientId: subject.patientId,
        hospitalId: subject.hospitalId,
        name: input.name,
        status: input.status,
        diagnosedDate: input.diagnosedDate ? new Date(input.diagnosedDate) : undefined,
        notes: input.notes,
        recordedBy: actor.sub,
      },
    });
  }

  async createAllergy(actor: RequestUser, input: CreateAllergyInput): Promise<Allergy> {
    const subject = await this.resolveWriteSubject(actor, input.patientId);
    return this.prisma.client.allergy.create({
      data: {
        patientId: subject.patientId,
        hospitalId: subject.hospitalId,
        allergen: input.allergen,
        reaction: input.reaction,
        severity: input.severity,
        recordedBy: actor.sub,
      },
    });
  }

  /** A patient never sees a consultation that's still a draft. */
  private consultationVisibility(actor: RequestUser): { status?: "COMPLETED" } {
    return actor.roles[0] === "PATIENT" ? { status: "COMPLETED" } : {};
  }

  /** Writing a condition/allergy is a diagnosis-level act: Doctor only
   * (docs/02 limits a Nurse's `medical_records.write` to vitals/notes), and
   * only for a patient they actually have an appointment with. */
  private async resolveWriteSubject(actor: RequestUser, patientId: string): Promise<{ patientId: string; hospitalId: string }> {
    if (actor.roles[0] !== "DOCTOR") {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const subject = await this.resolveSubject(actor, { patientId });
    return { patientId: subject.patientId, hospitalId: subject.hospitalId! };
  }

  private resolveSubject(actor: RequestUser, query: MedicalRecordsSubjectQuery): Promise<ClinicalSubject> {
    return resolveClinicalSubject(this.prisma, actor, query);
  }
}

type EntryRow = {
  id: string;
  startedAt: Date | null;
  hospitalId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  doctor: { id: string; user: { name: string } };
  appointment: { department: { name: string } };
  diagnoses: { icd10Code: string | null; description: string }[];
};

function toEntry(row: EntryRow): MedicalRecordEntry {
  return {
    type: "CONSULTATION",
    id: row.id,
    date: row.startedAt,
    hospitalId: row.hospitalId,
    status: row.status,
    doctor: { id: row.doctor.id, name: row.doctor.user.name },
    department: row.appointment.department.name,
    diagnoses: row.diagnoses,
  };
}
