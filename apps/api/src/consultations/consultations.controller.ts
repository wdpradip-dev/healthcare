import { Body, Controller, Get, Param, Patch, Post, UseInterceptors } from "@nestjs/common";
import {
  idParamSchema,
  startConsultationSchema,
  updateConsultationSchema,
  vitalsInputSchema,
  type StartConsultationInput,
  type UpdateConsultationInput,
  type VitalsInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { ConsultationsService } from "./consultations.service";
import type { ConsultationDetail } from "./consultation-access.util";

/** docs/15-API-SPECIFICATION.md "/consultations". */
@Controller("consultations")
@UseInterceptors(AuditInterceptor)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @RequirePermission("consultations.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<ConsultationDetail> {
    return this.consultationsService.getById(actor, params.id);
  }

  @RequirePermission("consultations.write")
  @Post()
  @Audit({ action: "CONSULTATION_START", resourceType: "Consultation" })
  start(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(startConsultationSchema)) body: StartConsultationInput): Promise<ConsultationDetail> {
    return this.consultationsService.start(actor, body);
  }

  @RequirePermission("consultations.write")
  @Patch(":id")
  @Audit({ action: "CONSULTATION_UPDATE", resourceType: "Consultation" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateConsultationSchema)) body: UpdateConsultationInput,
  ): Promise<ConsultationDetail> {
    return this.consultationsService.update(actor, params.id, body);
  }

  @RequirePermission("medical_records.write")
  @Patch(":id/vitals")
  updateVitals(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(vitalsInputSchema)) body: VitalsInput,
  ): Promise<ConsultationDetail> {
    return this.consultationsService.updateVitals(actor, params.id, body);
  }

  @RequirePermission("consultations.write")
  @Post(":id/complete")
  @Audit({ action: "CONSULTATION_COMPLETE", resourceType: "Consultation" })
  complete(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<ConsultationDetail> {
    return this.consultationsService.complete(actor, params.id);
  }
}
