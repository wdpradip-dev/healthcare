import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createPrescriptionSchema,
  idParamSchema,
  listMedicationsQuerySchema,
  listPrescriptionsQuerySchema,
  type CreatePrescriptionInput,
  type ListMedicationsQuery,
  type ListPrescriptionsQuery,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { PrescriptionsService, type PrescriptionDetail } from "./prescriptions.service";

/** docs/15-API-SPECIFICATION.md "/prescriptions" and "/medications". Audit rows are written by the service (PRESCRIPTION_CREATE/VIEW). */
@Controller()
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @RequirePermission("prescriptions.write")
  @Get("medications")
  listMedications(@Query(new ZodValidationPipe(listMedicationsQuerySchema)) query: ListMedicationsQuery) {
    return this.prescriptionsService.listMedications(query);
  }

  @RequirePermission("prescriptions.read")
  @Get("prescriptions")
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listPrescriptionsQuerySchema)) query: ListPrescriptionsQuery,
  ): Promise<PrescriptionDetail[]> {
    return this.prescriptionsService.list(actor, query);
  }

  @RequirePermission("prescriptions.write")
  @Post("prescriptions")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createPrescriptionSchema)) body: CreatePrescriptionInput): Promise<PrescriptionDetail> {
    return this.prescriptionsService.create(actor, body);
  }

  @RequirePermission("prescriptions.read")
  @Get("prescriptions/:id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<PrescriptionDetail> {
    return this.prescriptionsService.getById(actor, params.id);
  }

  @RequirePermission("prescriptions.read")
  @Get("prescriptions/:id/pdf")
  getPdf(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.prescriptionsService.getPdfUrl(actor, params.id);
  }
}
