import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@hospital/database";
import { DomainException, type AiReportAssistProvider, type StorageProvider } from "@hospital/shared";
import type { CreateReportFields, ListReportsQuery, UpdateReportInput, VerifyReportInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../common/types/request-user";
import { resolveClinicalScope, type ClinicalScope } from "../consultations/clinical-scope.util";
import type { MalwareScanner } from "../storage/malware-scanner";
import { AI_REPORT_ASSIST_PROVIDER, MALWARE_SCANNER, STORAGE_PROVIDER } from "../storage/storage.tokens";
import { buildStorageKey, validateUpload, type UploadedFile } from "../storage/upload.util";

type ReportType = "lab" | "imaging";
type PipelineStatus = "RAW" | "EXTRACTED" | "AI_ANALYZED" | "HUMAN_REVIEWED" | "RELEASED";

const LAB_INCLUDE = {
  patient: { select: { id: true, user: { select: { name: true } } } },
  verifiedByUser: { select: { name: true } },
  labOrder: { select: { doctorId: true, status: true } },
} satisfies Prisma.LabReportInclude;

const IMAGING_INCLUDE = {
  patient: { select: { id: true, user: { select: { name: true } } } },
  verifiedByUser: { select: { name: true } },
  labOrder: { select: { doctorId: true, status: true } },
} satisfies Prisma.ImagingReportInclude;

type LabRow = Prisma.LabReportGetPayload<{ include: typeof LAB_INCLUDE }>;
type ImagingRow = Prisma.ImagingReportGetPayload<{ include: typeof IMAGING_INCLUDE }>;
/** The filter fields lab and imaging reports share, valid as a filter on both tables. */
interface CommonWhere {
  patientId?: string;
  hospitalId?: string;
  patient?: Prisma.PatientWhereInput;
  pipelineStatus?: PipelineStatus;
}

type Loaded = { type: "lab"; row: LabRow } | { type: "imaging"; row: ImagingRow };

/**
 * The AI summary and its provenance travel as one object (docs/27): a client
 * cannot render `text` without `aiGenerated` and `reviewedBy` because they are
 * not separate fields. `reviewedBy` is null until a doctor has verified it —
 * only clinicians ever see that pre-release state.
 */
export interface AiSummaryView {
  text: string;
  aiGenerated: true;
  reviewedBy: string | null;
}

export interface ReportView {
  id: string;
  type: ReportType;
  title: string;
  patientId: string;
  patientName: string;
  hospitalId: string;
  labOrderId: string | null;
  pipelineStatus: PipelineStatus;
  structuredValues: Prisma.JsonValue | null;
  findings: string | null;
  aiSummary: AiSummaryView | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  releasedAt: Date | null;
  createdAt: Date;
}

/**
 * `/reports` — lab + imaging behind one surface (docs/15, docs/21). The
 * pipeline only moves forward (RAW → EXTRACTED → AI_ANALYZED → RELEASED; the
 * doctor's verify is the HUMAN_REVIEWED step and releases in one action), every
 * transition is a compare-and-set on the expected prior status, and a patient
 * query never matches an unreleased row.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    @Inject(AI_REPORT_ASSIST_PROVIDER) private readonly ai: AiReportAssistProvider,
  ) {}

  async list(actor: RequestUser, query: ListReportsQuery): Promise<ReportView[]> {
    const scope = await resolveClinicalScope(this.prisma, actor, query);
    const where = this.scopeWhere(actor, scope, query.status);
    const [labs, imaging] = await Promise.all([
      query.type === "imaging" ? [] : this.prisma.client.labReport.findMany({ where, include: LAB_INCLUDE }),
      query.type === "lab" ? [] : this.prisma.client.imagingReport.findMany({ where, include: IMAGING_INCLUDE }),
    ]);
    return [...labs.map((row) => toView({ type: "lab", row })), ...imaging.map((row) => toView({ type: "imaging", row }))].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getById(actor: RequestUser, id: string): Promise<ReportView> {
    const loaded = await this.load(actor, id);
    await this.record(actor, "REPORT_VIEW", loaded);
    return toView(loaded);
  }

  async create(actor: RequestUser, fields: CreateReportFields, file: UploadedFile | undefined): Promise<ReportView> {
    const doctor = await this.requireDoctor(actor);
    const order = await this.prisma.client.labOrder.findFirst({ where: { id: fields.labOrderId, doctorId: doctor.id, hospitalId: doctor.hospitalId } });
    if (!order) {
      throw new DomainException("NOT_FOUND", "Lab order not found.");
    }
    if (order.status === "CANCELLED") {
      throw new DomainException("REPORT_STATE_INVALID", "This lab order was cancelled.");
    }

    const upload = await validateUpload(file, this.scanner);
    const entered = fields.type === "lab" ? fields.structuredValues !== undefined : fields.findings !== undefined;
    const pipelineStatus = entered ? "EXTRACTED" : "RAW";
    const key = buildStorageKey(order.hospitalId, "report");
    await this.storage.upload({ key, contentType: upload.mimeType, body: upload.buffer });

    try {
      const id = await this.prisma.client.$transaction(async (tx) => {
        const base = { labOrderId: order.id, hospitalId: order.hospitalId, patientId: order.patientId, pipelineStatus } as const;
        const created =
          fields.type === "lab"
            ? await tx.labReport.create({
                data: { ...base, reportType: fields.title, structuredValues: (fields.structuredValues ?? {}) as Prisma.InputJsonValue },
              })
            : await tx.imagingReport.create({ data: { ...base, imagingType: fields.title, findings: fields.findings } });
        await tx.document.create({
          data: {
            hospitalId: order.hospitalId,
            ownerPatientId: order.patientId,
            uploadedBy: actor.sub,
            category: "REPORT_ATTACHMENT",
            linkedEntityType: fields.type === "lab" ? "LabReport" : "ImagingReport",
            linkedEntityId: created.id,
            storageKey: key,
            fileName: upload.fileName,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
          },
        });
        if (order.status === "ORDERED") {
          await tx.labOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
        }
        return created.id;
      });
      const loaded = await this.load(actor, id);
      await this.record(actor, "REPORT_UPLOAD", loaded);
      return toView(loaded);
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async update(actor: RequestUser, id: string, input: UpdateReportInput): Promise<ReportView> {
    const loaded = await this.loadForWrite(actor, id);
    if (loaded.type === "lab" && input.structuredValues === undefined) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "structuredValues", message: "Lab reports take structuredValues." }]);
    }
    if (loaded.type === "imaging" && input.findings === undefined) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "findings", message: "Imaging reports take findings." }]);
    }

    const expected: PipelineStatus[] = ["RAW", "EXTRACTED"];
    const { count } =
      loaded.type === "lab"
        ? await this.prisma.client.labReport.updateMany({
            where: { id, pipelineStatus: { in: expected } },
            data: { structuredValues: input.structuredValues as Prisma.InputJsonValue, pipelineStatus: "EXTRACTED" },
          })
        : await this.prisma.client.imagingReport.updateMany({
            where: { id, pipelineStatus: { in: expected } },
            data: { findings: input.findings, pipelineStatus: "EXTRACTED" },
          });
    if (count === 0) {
      throw new DomainException("REPORT_STATE_INVALID", "Values can no longer be changed on this report.");
    }
    await this.record(actor, "REPORT_UPDATE", loaded);
    return toView(await this.load(actor, id));
  }

  async analyze(actor: RequestUser, id: string): Promise<{ report: ReportView; aiAvailable: boolean }> {
    const loaded = await this.loadForWrite(actor, id);
    if (loaded.row.pipelineStatus !== "EXTRACTED") {
      throw new DomainException("REPORT_STATE_INVALID", "Enter the report values before requesting an AI summary.");
    }

    const content = loaded.type === "lab" ? loaded.row.structuredValues : loaded.row.findings;
    const title = loaded.type === "lab" ? loaded.row.reportType : loaded.row.imagingType;
    // Graceful absence (docs/27): no provider, a timeout or an unusable answer just means "no AI stage".
    const result = this.ai.isConfigured ? await this.ai.summarize({ kind: loaded.type, title, content }) : null;
    if (!result) {
      return { report: toView(loaded), aiAvailable: false };
    }

    const data = { aiGenerated: true, aiSummary: result.summary, pipelineStatus: "AI_ANALYZED" as const };
    const { count } =
      loaded.type === "lab"
        ? await this.prisma.client.labReport.updateMany({ where: { id, pipelineStatus: "EXTRACTED" }, data })
        : await this.prisma.client.imagingReport.updateMany({ where: { id, pipelineStatus: "EXTRACTED" }, data });
    if (count === 0) {
      throw new DomainException("REPORT_STATE_INVALID", "This report has already moved on.");
    }
    await this.record(actor, "REPORT_AI_ANALYZE", loaded, { provider: result.provider, model: result.model });
    return { report: toView(await this.load(actor, id)), aiAvailable: true };
  }

  async verify(actor: RequestUser, id: string, input: VerifyReportInput): Promise<ReportView> {
    const loaded = await this.loadForWrite(actor, id);
    const status = loaded.row.pipelineStatus;
    if (status !== "EXTRACTED" && status !== "AI_ANALYZED") {
      throw new DomainException("REPORT_STATE_INVALID", "Only a report with entered values that has not been released can be verified.");
    }

    const hasAiSummary = status === "AI_ANALYZED" && loaded.row.aiSummary !== null;
    if (hasAiSummary && !input.aiSummaryDecision) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "aiSummaryDecision", message: "Accept, edit or discard the AI summary before releasing." },
      ]);
    }
    if (!hasAiSummary && input.aiSummaryDecision) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "aiSummaryDecision", message: "This report has no AI summary." }]);
    }

    let aiGenerated = loaded.row.aiGenerated;
    let aiSummary = loaded.row.aiSummary;
    if (input.aiSummaryDecision === "DISCARD") {
      aiGenerated = false;
      aiSummary = null;
    } else if (input.aiSummaryDecision === "EDIT") {
      aiSummary = input.editedAiSummary ?? null;
    }

    const now = new Date();
    const data = { pipelineStatus: "RELEASED" as const, aiGenerated, aiSummary, verifiedBy: actor.sub, verifiedAt: now, releasedAt: now };
    const { count } = await this.prisma.client.$transaction(async (tx) => {
      const updated =
        loaded.type === "lab"
          ? await tx.labReport.updateMany({ where: { id, pipelineStatus: status }, data })
          : await tx.imagingReport.updateMany({ where: { id, pipelineStatus: status }, data });
      if (updated.count === 1 && loaded.row.labOrderId) {
        await tx.labOrder.update({ where: { id: loaded.row.labOrderId }, data: { status: "COMPLETED" } });
      }
      return updated;
    });
    if (count === 0) {
      throw new DomainException("REPORT_STATE_INVALID", "This report has already moved on.");
    }
    await this.record(actor, "REPORT_VERIFY", loaded, { aiSummaryDecision: input.aiSummaryDecision ?? null });
    return toView(await this.load(actor, id));
  }

  async getFileUrl(actor: RequestUser, id: string): Promise<{ url: string }> {
    const loaded = await this.load(actor, id);
    const document = await this.prisma.client.document.findFirst({
      where: { linkedEntityType: loaded.type === "lab" ? "LabReport" : "ImagingReport", linkedEntityId: id, category: "REPORT_ATTACHMENT", deletedAt: null },
    });
    if (!document) {
      throw new DomainException("NOT_FOUND", "This report has no file.");
    }
    await this.record(actor, "REPORT_DOWNLOAD", loaded);
    return { url: await this.storage.getSignedDownloadUrl({ key: document.storageKey }) };
  }

  private async requireDoctor(actor: RequestUser) {
    // SUPER_ADMIN nominally holds reports.upload/verify but clinical writes are break-glass-only (docs/02, docs/25).
    const doctor = actor.roles[0] === "DOCTOR" ? await this.prisma.client.doctor.findUnique({ where: { userId: actor.sub } }) : null;
    if (!doctor) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    return doctor;
  }

  /** In scope *and* the ordering doctor — everything that changes a report. */
  private async loadForWrite(actor: RequestUser, id: string): Promise<Loaded> {
    const doctor = await this.requireDoctor(actor);
    const loaded = await this.load(actor, id);
    if (loaded.row.labOrder?.doctorId !== doctor.id) {
      throw new DomainException("NOT_FOUND", "Report not found.");
    }
    return loaded;
  }

  private async load(actor: RequestUser, id: string): Promise<Loaded> {
    const scope = await resolveClinicalScope(this.prisma, actor);
    const where = { id, ...this.scopeWhere(actor, scope) };
    const lab = await this.prisma.client.labReport.findFirst({ where, include: LAB_INCLUDE });
    if (lab) return { type: "lab", row: lab };
    const imaging = await this.prisma.client.imagingReport.findFirst({ where, include: IMAGING_INCLUDE });
    if (imaging) return { type: "imaging", row: imaging };
    throw new DomainException("NOT_FOUND", "Report not found.");
  }

  /** A patient's query can only ever match a RELEASED row — enforced here, not in the UI. */
  private scopeWhere(actor: RequestUser, scope: ClinicalScope, status?: PipelineStatus): CommonWhere {
    return {
      ...(scope.patientId ? { patientId: scope.patientId } : {}),
      ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
      ...(scope.patientFilter ? { patient: scope.patientFilter } : {}),
      ...(actor.roles[0] === "PATIENT" ? { pipelineStatus: "RELEASED" as const } : status ? { pipelineStatus: status } : {}),
    };
  }

  private async record(actor: RequestUser, action: string, loaded: Loaded, extra?: Prisma.InputJsonObject): Promise<void> {
    await this.audit.record({
      hospitalId: loaded.row.hospitalId,
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action,
      resourceType: loaded.type === "lab" ? "LabReport" : "ImagingReport",
      resourceId: loaded.row.id,
      afterState: extra,
    });
  }
}

function toView(loaded: Loaded): ReportView {
  const { row } = loaded;
  return {
    id: row.id,
    type: loaded.type,
    title: loaded.type === "lab" ? loaded.row.reportType : loaded.row.imagingType,
    patientId: row.patientId,
    patientName: row.patient.user.name,
    hospitalId: row.hospitalId,
    labOrderId: row.labOrderId,
    pipelineStatus: row.pipelineStatus,
    structuredValues: loaded.type === "lab" ? loaded.row.structuredValues : null,
    findings: loaded.type === "imaging" ? loaded.row.findings : null,
    aiSummary: row.aiGenerated && row.aiSummary ? { text: row.aiSummary, aiGenerated: true, reviewedBy: row.verifiedByUser?.name ?? null } : null,
    verifiedAt: row.verifiedAt,
    verifiedByName: row.verifiedByUser?.name ?? null,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
  };
}
