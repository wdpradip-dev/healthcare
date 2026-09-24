import { Injectable } from "@nestjs/common";
import { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { StartConsultationInput, UpdateConsultationInput, VitalsInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../common/types/request-user";
import { NotificationStubService } from "../appointments/notification-stub.service";
import { loadConsultationInScope, stripInternalNotes, type ConsultationDetail } from "./consultation-access.util";

/**
 * `/consultations` — docs/15-API-SPECIFICATION.md. Clinical *writes* are
 * deliberately narrower than the permission strings suggest:
 *   - Doctor only (the treating doctor of that consultation) for
 *     start/update/complete — `SUPER_ADMIN` nominally holds every permission
 *     but clinical write is break-glass-only (docs/02, docs/25-SECURITY.md),
 *     and that mechanism isn't built, so it is refused here rather than
 *     silently allowed.
 *   - Vitals additionally by a Nurse at the appointment's branch — the one
 *     clinical write docs/02 grants a Nurse ("vitals/notes only").
 */
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationStubService,
  ) {}

  async getById(actor: RequestUser, id: string): Promise<ConsultationDetail> {
    const consultation = await loadConsultationInScope(this.prisma, actor, id);
    return stripInternalNotes(consultation, actor);
  }

  async start(actor: RequestUser, input: StartConsultationInput): Promise<ConsultationDetail> {
    this.assertDoctor(actor);
    const doctor = await this.prisma.client.doctor.findUnique({ where: { userId: actor.sub } });
    const appointment = await this.prisma.client.appointment.findUnique({ where: { id: input.appointmentId } });
    // Another doctor's (or hospital's) appointment is indistinguishable from a missing one.
    if (!doctor || !appointment || appointment.doctorId !== doctor.id) {
      throw new DomainException("NOT_FOUND", "Appointment not found.");
    }
    if (appointment.status !== "CHECKED_IN") {
      throw new DomainException("CONSULTATION_STATE_INVALID", "A consultation can only be started for a checked-in appointment.");
    }

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const now = new Date();
        const consultation = await tx.consultation.create({
          data: {
            appointmentId: appointment.id,
            hospitalId: appointment.hospitalId,
            doctorId: doctor.id,
            patientId: appointment.patientId,
            startedAt: now,
          },
        });
        await tx.appointment.update({ where: { id: appointment.id }, data: { status: "IN_PROGRESS", startedAt: now } });
        return consultation;
      });
      return await this.getById(actor, created.id);
    } catch (error) {
      // `appointmentId` is unique — a second start (double-tap, or a race) lands here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException("CONSULTATION_STATE_INVALID", "A consultation has already been started for this appointment.");
      }
      throw error;
    }
  }

  async update(actor: RequestUser, id: string, input: UpdateConsultationInput): Promise<ConsultationDetail> {
    this.assertDoctor(actor);
    const consultation = await this.loadWritable(actor, id);

    if (input.notes) {
      const existingIds = input.notes.flatMap((n) => (n.id ? [n.id] : []));
      if (existingIds.length > 0) {
        const existing = await this.prisma.client.clinicalNote.findMany({ where: { id: { in: existingIds }, consultationId: id } });
        if (existing.length !== new Set(existingIds).size) {
          throw new DomainException("NOT_FOUND", "Clinical note not found.");
        }
        if (existing.some((note) => note.authorId !== actor.sub)) {
          throw new DomainException("FORBIDDEN", "You can only edit your own clinical notes.");
        }
      }
    }

    const events: { action: string; resourceType: string; resourceId: string }[] = [];
    await this.prisma.client.$transaction(async (tx) => {
      for (const note of input.notes ?? []) {
        if (note.id) {
          await tx.clinicalNote.update({ where: { id: note.id }, data: { content: note.content, isInternal: note.isInternal } });
          events.push({ action: "CLINICAL_NOTE_UPDATE", resourceType: "ClinicalNote", resourceId: note.id });
        } else {
          const created = await tx.clinicalNote.create({
            data: { consultationId: id, authorId: actor.sub, content: note.content, isInternal: note.isInternal },
          });
          events.push({ action: "CLINICAL_NOTE_CREATE", resourceType: "ClinicalNote", resourceId: created.id });
        }
      }

      if (input.diagnoses) {
        await tx.diagnosis.deleteMany({ where: { consultationId: id } });
        if (input.diagnoses.length > 0) {
          await tx.diagnosis.createMany({
            data: input.diagnoses.map((d) => ({ consultationId: id, icd10Code: d.icd10Code, description: d.description })),
          });
          events.push({ action: "DIAGNOSIS_CREATE", resourceType: "Diagnosis", resourceId: id });
        }
      }

      if (input.vitals) {
        const existing = await tx.vital.findFirst({ where: { consultationId: id, recordedBy: actor.sub }, orderBy: { recordedAt: "desc" } });
        if (existing) {
          await tx.vital.update({ where: { id: existing.id }, data: input.vitals });
        } else {
          await tx.vital.create({ data: { ...input.vitals, consultationId: id, patientId: consultation.patientId, recordedBy: actor.sub } });
        }
        events.push({ action: "VITAL_RECORD", resourceType: "Vital", resourceId: id });
      }
    });

    await this.recordEvents(actor, consultation.hospitalId, events);
    return this.getById(actor, id);
  }

  async updateVitals(actor: RequestUser, id: string, vitals: VitalsInput): Promise<ConsultationDetail> {
    const role = actor.roles[0];
    if (role !== "DOCTOR" && role !== "NURSE") {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const consultation = await this.loadWritable(actor, id);

    const existing = await this.prisma.client.vital.findFirst({
      where: { consultationId: id, recordedBy: actor.sub },
      orderBy: { recordedAt: "desc" },
    });
    if (existing) {
      await this.prisma.client.vital.update({ where: { id: existing.id }, data: vitals });
    } else {
      await this.prisma.client.vital.create({ data: { ...vitals, consultationId: id, patientId: consultation.patientId, recordedBy: actor.sub } });
    }

    await this.recordEvents(actor, consultation.hospitalId, [{ action: "VITAL_RECORD", resourceType: "Vital", resourceId: id }]);
    return this.getById(actor, id);
  }

  async complete(actor: RequestUser, id: string): Promise<ConsultationDetail> {
    this.assertDoctor(actor);
    const consultation = await this.loadWritable(actor, id);

    // docs/09: "Complete disabled until at least one diagnosis or note present".
    if (consultation.clinicalNotes.length === 0 && consultation.diagnoses.length === 0) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "notes", message: "Add at least one clinical note or diagnosis before completing." },
      ]);
    }

    await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      await tx.consultation.update({ where: { id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.appointment.update({ where: { id: consultation.appointmentId }, data: { status: "COMPLETED", completedAt: now } });
      await tx.appointmentHistory.create({ data: { appointmentId: consultation.appointmentId, action: "COMPLETED", performedBy: actor.sub } });
    });

    this.notifications.trigger("CONSULTATION_COMPLETED", consultation.appointmentId);
    return this.getById(actor, id);
  }

  private assertDoctor(actor: RequestUser): void {
    if (actor.roles[0] !== "DOCTOR") {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
  }

  /** Scope gate (`loadConsultationInScope`) plus "still open for edits". */
  private async loadWritable(actor: RequestUser, id: string): Promise<ConsultationDetail> {
    const consultation = await loadConsultationInScope(this.prisma, actor, id);
    if (consultation.status !== "IN_PROGRESS") {
      throw new DomainException("CONSULTATION_STATE_INVALID", "This consultation is already completed.");
    }
    return consultation;
  }

  private async recordEvents(actor: RequestUser, hospitalId: string, events: { action: string; resourceType: string; resourceId: string }[]): Promise<void> {
    for (const event of events) {
      await this.audit.record({ hospitalId, actorUserId: actor.sub, actorRole: actor.roles[0] ?? "UNKNOWN", ...event });
    }
  }
}
