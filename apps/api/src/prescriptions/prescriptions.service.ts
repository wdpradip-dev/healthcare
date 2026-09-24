import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@hospital/database";
import { DomainException, type StorageProvider } from "@hospital/shared";
import type { CreatePrescriptionInput, ListMedicationsQuery, ListPrescriptionsQuery } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../common/types/request-user";
import { loadConsultationInScope } from "../consultations/consultation-access.util";
import { resolveClinicalScope, type ClinicalScope } from "../consultations/clinical-scope.util";
import { STORAGE_PROVIDER } from "../storage/storage.tokens";
import { buildStorageKey } from "../storage/upload.util";
import { buildTextPdf } from "./prescription-pdf";

const PRESCRIPTION_INCLUDE = {
  items: { include: { medication: { select: { id: true, name: true, genericName: true, form: true, strength: true } } } },
  doctor: { select: { id: true, user: { select: { name: true } } } },
  patient: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.PrescriptionInclude;

export type PrescriptionDetail = Prisma.PrescriptionGetPayload<{ include: typeof PRESCRIPTION_INCLUDE }>;

/**
 * `/prescriptions` — docs/15. Issuing is the treating Doctor only; a
 * prescription is immutable, so a correction is a new row that `supersedes`
 * the old one (which flips to SUPERSEDED in the same transaction).
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async listMedications(query: ListMedicationsQuery) {
    return this.prisma.client.medication.findMany({
      where: {
        isActive: true,
        ...(query.query
          ? { OR: [{ name: { contains: query.query, mode: "insensitive" } }, { genericName: { contains: query.query, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 20,
    });
  }

  async list(actor: RequestUser, query: ListPrescriptionsQuery): Promise<PrescriptionDetail[]> {
    const scope = await resolveClinicalScope(this.prisma, actor, query);
    return this.prisma.client.prescription.findMany({
      where: { ...this.scopeWhere(actor, scope), ...(query.status ? { status: query.status } : {}) },
      include: PRESCRIPTION_INCLUDE,
      orderBy: { issuedAt: "desc" },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<PrescriptionDetail> {
    const prescription = await this.loadInScope(actor, id);
    await this.recordView(actor, prescription);
    return prescription;
  }

  async create(actor: RequestUser, input: CreatePrescriptionInput): Promise<PrescriptionDetail> {
    if (actor.roles[0] !== "DOCTOR") {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const consultation = await loadConsultationInScope(this.prisma, actor, input.consultationId);

    if (!input.supersedesId && consultation.status !== "IN_PROGRESS") {
      throw new DomainException("CONSULTATION_STATE_INVALID", "Prescriptions can only be added while the consultation is in progress.");
    }

    const medicationIds = [...new Set(input.items.flatMap((i) => (i.medicationId ? [i.medicationId] : [])))];
    if (medicationIds.length > 0) {
      const found = await this.prisma.client.medication.count({ where: { id: { in: medicationIds }, isActive: true } });
      if (found !== medicationIds.length) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "items", message: "Unknown medication." }]);
      }
    }

    if (input.supersedesId) {
      const previous = await this.prisma.client.prescription.findFirst({
        where: { id: input.supersedesId, doctorId: consultation.doctor.id, patientId: consultation.patientId, hospitalId: consultation.hospitalId },
      });
      if (!previous) {
        throw new DomainException("NOT_FOUND", "Prescription not found.");
      }
      if (previous.status !== "ACTIVE") {
        throw new DomainException("CONSULTATION_STATE_INVALID", "Only an active prescription can be superseded.");
      }
    }

    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.prescription.create({
          data: {
            consultationId: consultation.id,
            hospitalId: consultation.hospitalId,
            doctorId: consultation.doctor.id,
            patientId: consultation.patientId,
            supersedesId: input.supersedesId,
            issuedAt: new Date(),
            items: {
              create: input.items.map((item) => ({
                medicationId: item.medicationId,
                freeTextName: item.freeTextName,
                dosage: item.dosage,
                frequency: item.frequency,
                durationDays: item.durationDays,
                instructions: item.instructions,
                quantity: item.quantity,
              })),
            },
          },
        });
        if (input.supersedesId) {
          await tx.prescription.update({ where: { id: input.supersedesId }, data: { status: "SUPERSEDED" } });
        }
        return created.id;
      });
      const detail = await this.prisma.client.prescription.findUniqueOrThrow({ where: { id }, include: PRESCRIPTION_INCLUDE });
      await this.audit.record({
        hospitalId: detail.hospitalId,
        actorUserId: actor.sub,
        actorRole: actor.roles[0] ?? "UNKNOWN",
        action: "PRESCRIPTION_CREATE",
        resourceType: "Prescription",
        resourceId: detail.id,
        afterState: { consultationId: detail.consultationId, itemCount: detail.items.length, supersedesId: detail.supersedesId },
      });
      return detail;
    } catch (error) {
      // `supersedesId` is unique — a concurrent correction of the same prescription lands here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException("CONSULTATION_STATE_INVALID", "This prescription has already been superseded.");
      }
      throw error;
    }
  }

  async getPdfUrl(actor: RequestUser, id: string): Promise<{ url: string }> {
    const prescription = await this.loadInScope(actor, id);

    let document = await this.prisma.client.document.findFirst({
      where: { linkedEntityType: "Prescription", linkedEntityId: prescription.id, category: "PRESCRIPTION_PDF", deletedAt: null },
    });
    if (!document) {
      const hospital = await this.prisma.client.hospital.findUnique({ where: { id: prescription.hospitalId }, select: { name: true } });
      const body = buildTextPdf(this.pdfLines(prescription, hospital?.name ?? "Hospital"));
      const key = buildStorageKey(prescription.hospitalId, "prescription");
      await this.storage.upload({ key, contentType: "application/pdf", body });
      document = await this.prisma.client.document.create({
        data: {
          hospitalId: prescription.hospitalId,
          ownerPatientId: prescription.patientId,
          uploadedBy: actor.sub,
          category: "PRESCRIPTION_PDF",
          linkedEntityType: "Prescription",
          linkedEntityId: prescription.id,
          storageKey: key,
          fileName: `prescription-${prescription.id.slice(0, 8)}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: body.length,
        },
      });
    }

    await this.recordView(actor, prescription);
    const url = await this.storage.getSignedDownloadUrl({ key: document.storageKey });
    return { url };
  }

  private async loadInScope(actor: RequestUser, id: string): Promise<PrescriptionDetail> {
    const scope = await resolveClinicalScope(this.prisma, actor);
    const prescription = await this.prisma.client.prescription.findFirst({
      where: { id, ...this.scopeWhere(actor, scope) },
      include: PRESCRIPTION_INCLUDE,
    });
    if (!prescription) {
      throw new DomainException("NOT_FOUND", "Prescription not found.");
    }
    return prescription;
  }

  /** A patient never sees a prescription from a consultation that is still a draft. */
  private scopeWhere(actor: RequestUser, scope: ClinicalScope): Prisma.PrescriptionWhereInput {
    return {
      ...(scope.patientId ? { patientId: scope.patientId } : {}),
      ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
      ...(scope.patientFilter ? { patient: scope.patientFilter } : {}),
      ...(actor.roles[0] === "PATIENT" ? { consultation: { status: "COMPLETED" as const } } : {}),
    };
  }

  private async recordView(actor: RequestUser, prescription: PrescriptionDetail): Promise<void> {
    await this.audit.record({
      hospitalId: prescription.hospitalId,
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "PRESCRIPTION_VIEW",
      resourceType: "Prescription",
      resourceId: prescription.id,
    });
  }

  private pdfLines(p: PrescriptionDetail, hospitalName: string): string[] {
    const lines = [
      hospitalName,
      "PRESCRIPTION",
      "",
      `Patient: ${p.patient.user.name}`,
      `Doctor: ${p.doctor.user.name}`,
      `Issued: ${p.issuedAt.toISOString().slice(0, 10)}`,
      `Reference: ${p.id}`,
      "",
    ];
    p.items.forEach((item, i) => {
      const name = item.medication ? [item.medication.name, item.medication.strength].filter(Boolean).join(" ") : (item.freeTextName ?? "");
      lines.push(`${i + 1}. ${name}`);
      lines.push(`   ${item.dosage}, ${item.frequency}${item.durationDays ? `, ${item.durationDays} days` : ""}${item.quantity ? `, qty ${item.quantity}` : ""}`);
      if (item.instructions) lines.push(`   ${item.instructions}`);
    });
    lines.push("", "Synthetic demo data - not a real prescription.");
    return lines;
  }
}
