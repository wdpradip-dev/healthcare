import { Injectable } from "@nestjs/common";
import type { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { CreateLabOrderInput, ListLabOrdersQuery } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../common/types/request-user";
import { loadConsultationInScope } from "../consultations/consultation-access.util";
import { resolveClinicalScope } from "../consultations/clinical-scope.util";
import { resolveClinicalSubject } from "../consultations/clinical-subject.util";

const LAB_ORDER_INCLUDE = {
  patient: { select: { id: true, user: { select: { name: true } } } },
  doctor: { select: { id: true, user: { select: { name: true } } } },
  labReports: { select: { id: true, pipelineStatus: true } },
  imagingReports: { select: { id: true, pipelineStatus: true } },
} satisfies Prisma.LabOrderInclude;

export type LabOrderDetail = Prisma.LabOrderGetPayload<{ include: typeof LAB_ORDER_INCLUDE }>;

/** `/lab-orders` — docs/15. Ordering is the treating Doctor only (docs/02); anyone with `lab_orders.read` reads within their scope. */
@Injectable()
export class LabOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: ListLabOrdersQuery): Promise<LabOrderDetail[]> {
    const scope = await resolveClinicalScope(this.prisma, actor, query);
    return this.prisma.client.labOrder.findMany({
      where: {
        ...(scope.patientId ? { patientId: scope.patientId } : {}),
        ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
        ...(scope.patientFilter ? { patient: scope.patientFilter } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: LAB_ORDER_INCLUDE,
      orderBy: { orderedAt: "desc" },
    });
  }

  async create(actor: RequestUser, input: CreateLabOrderInput): Promise<LabOrderDetail> {
    const doctor = actor.roles[0] === "DOCTOR" ? await this.prisma.client.doctor.findUnique({ where: { userId: actor.sub } }) : null;
    if (!doctor) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }

    let patientId: string;
    let consultationId: string | undefined;
    if (input.consultationId) {
      const consultation = await loadConsultationInScope(this.prisma, actor, input.consultationId);
      if (consultation.status !== "IN_PROGRESS") {
        throw new DomainException("CONSULTATION_STATE_INVALID", "Tests can only be ordered while the consultation is in progress.");
      }
      if (input.patientId && input.patientId !== consultation.patientId) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "patientId", message: "Does not match the consultation." }]);
      }
      patientId = consultation.patientId;
      consultationId = consultation.id;
    } else {
      const subject = await resolveClinicalSubject(this.prisma, actor, { patientId: input.patientId });
      patientId = subject.patientId;
    }

    const order = await this.prisma.client.labOrder.create({
      data: {
        consultationId,
        hospitalId: doctor.hospitalId,
        doctorId: doctor.id,
        patientId,
        testType: input.testType,
        priority: input.priority,
        notes: input.notes,
      },
      include: LAB_ORDER_INCLUDE,
    });
    await this.audit.record({
      hospitalId: order.hospitalId,
      actorUserId: actor.sub,
      actorRole: "DOCTOR",
      action: "LAB_ORDER_CREATE",
      resourceType: "LabOrder",
      resourceId: order.id,
      afterState: { testType: order.testType, priority: order.priority, consultationId: order.consultationId },
    });
    return order;
  }
}
