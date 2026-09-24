import { Inject, Injectable } from "@nestjs/common";
import type { Document } from "@hospital/database";
import { DomainException, type StorageProvider } from "@hospital/shared";
import type { ListDocumentsQuery, UploadDocumentFields } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../common/types/request-user";
import { resolveClinicalScope } from "../consultations/clinical-scope.util";
import { resolveClinicalSubject } from "../consultations/clinical-subject.util";
import { getActorPatientId } from "../appointments/appointment-access.util";
import type { MalwareScanner } from "../storage/malware-scanner";
import { MALWARE_SCANNER, STORAGE_PROVIDER } from "../storage/storage.tokens";
import { buildStorageKey, validateUpload, type UploadedFile } from "../storage/upload.util";

/** A document row without its storage key — the key is internal and never leaves the API. */
export type DocumentView = Omit<Document, "storageKey">;

function toView(document: Document): DocumentView {
  const view: Partial<Document> = { ...document };
  delete view.storageKey;
  return view as DocumentView;
}

/**
 * `/documents` — docs/15, docs/21. The generic attachment primitive. Scope is
 * the shared clinical scope over the owning patient plus the row's hospital
 * (documents a patient uploaded outside any appointment carry no hospital and
 * are therefore visible to that patient only). A patient additionally never
 * sees a document whose source is not yet patient-visible — a report's raw
 * file before RELEASED, or a prescription PDF from a consultation in progress
 * — otherwise the Documents surface would leak what the Reports surface hides.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async list(actor: RequestUser, query: ListDocumentsQuery): Promise<DocumentView[]> {
    const scope = await resolveClinicalScope(this.prisma, actor, query);
    const rows = await this.prisma.client.document.findMany({
      where: {
        deletedAt: null,
        ...(scope.patientId ? { ownerPatientId: scope.patientId } : {}),
        ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
        ...(scope.patientFilter ? { ownerPatient: scope.patientFilter } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.linkedEntityType ? { linkedEntityType: query.linkedEntityType } : {}),
        ...(query.linkedEntityId ? { linkedEntityId: query.linkedEntityId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const visible = actor.roles[0] === "PATIENT" ? await this.filterPatientVisible(rows) : rows;
    return visible.map(toView);
  }

  async getById(actor: RequestUser, id: string): Promise<DocumentView> {
    const document = await this.loadInScope(actor, id);
    await this.record(actor, "DOCUMENT_VIEW", document);
    return toView(document);
  }

  async getDownloadUrl(actor: RequestUser, id: string): Promise<{ url: string }> {
    const document = await this.loadInScope(actor, id);
    await this.record(actor, "DOCUMENT_DOWNLOAD", document);
    return { url: await this.storage.getSignedDownloadUrl({ key: document.storageKey }) };
  }

  async upload(actor: RequestUser, fields: UploadDocumentFields, file: UploadedFile | undefined): Promise<DocumentView> {
    const role = actor.roles[0];
    const { ownerPatientId, hospitalId } = await this.resolveOwner(actor, role, fields);
    const upload = await validateUpload(file, this.scanner);
    const key = buildStorageKey(hospitalId, "document");
    await this.storage.upload({ key, contentType: upload.mimeType, body: upload.buffer });

    try {
      const document = await this.prisma.client.document.create({
        data: {
          hospitalId,
          ownerPatientId,
          uploadedBy: actor.sub,
          category: fields.category,
          linkedEntityType: fields.linkedEntityType,
          linkedEntityId: fields.linkedEntityId,
          storageKey: key,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
        },
      });
      await this.record(actor, "DOCUMENT_UPLOAD", document);
      return toView(document);
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Whose document this is and which hospital it belongs to. A patient always
   * uploads for themself and may only link one of their own appointments;
   * staff (Doctor/Nurse hold `documents.upload`) name a patient they have a
   * relationship with and may link that patient's consultation/appointment at
   * their own hospital. A link that does not check out is a 404, never a
   * cross-tenant oracle.
   */
  private async resolveOwner(
    actor: RequestUser,
    role: string | undefined,
    fields: UploadDocumentFields,
  ): Promise<{ ownerPatientId: string; hospitalId: string | null }> {
    if (role === "PATIENT") {
      const patientId = await getActorPatientId(this.prisma, actor);
      if (fields.linkedEntityType === "Consultation") {
        throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
      }
      if (fields.linkedEntityType === "Appointment" && fields.linkedEntityId) {
        const appointment = await this.prisma.client.appointment.findFirst({ where: { id: fields.linkedEntityId, patientId } });
        if (!appointment) {
          throw new DomainException("NOT_FOUND", "Appointment not found.");
        }
        return { ownerPatientId: patientId, hospitalId: appointment.hospitalId };
      }
      return { ownerPatientId: patientId, hospitalId: null };
    }

    if (role !== "DOCTOR" && role !== "NURSE") {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const subject = await resolveClinicalSubject(this.prisma, actor, { patientId: fields.patientId });
    const hospitalId = subject.hospitalId!;
    if (fields.linkedEntityType === "Consultation" && fields.linkedEntityId) {
      const found = await this.prisma.client.consultation.count({ where: { id: fields.linkedEntityId, patientId: subject.patientId, hospitalId } });
      if (found === 0) throw new DomainException("NOT_FOUND", "Consultation not found.");
    }
    if (fields.linkedEntityType === "Appointment" && fields.linkedEntityId) {
      const found = await this.prisma.client.appointment.count({ where: { id: fields.linkedEntityId, patientId: subject.patientId, hospitalId } });
      if (found === 0) throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    return { ownerPatientId: subject.patientId, hospitalId };
  }

  private async loadInScope(actor: RequestUser, id: string): Promise<Document> {
    const scope = await resolveClinicalScope(this.prisma, actor);
    const document = await this.prisma.client.document.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(scope.patientId ? { ownerPatientId: scope.patientId } : {}),
        ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
        ...(scope.patientFilter ? { ownerPatient: scope.patientFilter } : {}),
      },
    });
    if (!document || (actor.roles[0] === "PATIENT" && (await this.filterPatientVisible([document])).length === 0)) {
      throw new DomainException("NOT_FOUND", "Document not found.");
    }
    return document;
  }

  private async filterPatientVisible(documents: Document[]): Promise<Document[]> {
    const idsOf = (type: string) => documents.filter((d) => d.linkedEntityType === type && d.linkedEntityId).map((d) => d.linkedEntityId!);
    const labs = await this.prisma.client.labReport.findMany({ where: { id: { in: idsOf("LabReport") }, pipelineStatus: "RELEASED" }, select: { id: true } });
    const imaging = await this.prisma.client.imagingReport.findMany({ where: { id: { in: idsOf("ImagingReport") }, pipelineStatus: "RELEASED" }, select: { id: true } });
    const prescriptions = await this.prisma.client.prescription.findMany({
      where: { id: { in: idsOf("Prescription") }, consultation: { status: "COMPLETED" } },
      select: { id: true },
    });
    const releasedLab = new Set(labs.map((r) => r.id));
    const releasedImaging = new Set(imaging.map((r) => r.id));
    const visiblePrescriptions = new Set(prescriptions.map((r) => r.id));

    return documents.filter((d) => {
      if (d.linkedEntityType === "LabReport") return releasedLab.has(d.linkedEntityId ?? "");
      if (d.linkedEntityType === "ImagingReport") return releasedImaging.has(d.linkedEntityId ?? "");
      if (d.linkedEntityType === "Prescription") return visiblePrescriptions.has(d.linkedEntityId ?? "");
      return true;
    });
  }

  private async record(actor: RequestUser, action: string, document: Document): Promise<void> {
    await this.audit.record({
      hospitalId: document.hospitalId,
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action,
      resourceType: "Document",
      resourceId: document.id,
    });
  }
}
