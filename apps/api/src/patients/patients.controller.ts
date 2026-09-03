import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import {
  idParamSchema,
  listPatientsQuerySchema,
  registerPatientSchema,
  updatePatientSchema,
  type ListPatientsQuery,
  type RegisterPatientInput,
  type UpdatePatientInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { PatientsService, type PatientWithUser } from "./patients.service";

/** docs/15-API-SPECIFICATION.md "/patients". Route order matters: `/me`
 * must be declared ahead of `:id` so Nest doesn't treat "me" as an id. */
@Controller("patients")
@UseInterceptors(AuditInterceptor)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @RequirePermission("patients.read")
  @Get("me")
  getMe(@CurrentUser() actor: RequestUser): Promise<PatientWithUser> {
    return this.patientsService.getMe(actor);
  }

  @RequirePermission("patients.write")
  @Patch("me")
  @Audit({ action: "PATIENT_UPDATE", resourceType: "Patient" })
  updateMe(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
  ): Promise<PatientWithUser> {
    return this.patientsService.updateMe(actor, body);
  }

  @RequirePermission("patients.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listPatientsQuerySchema)) query: ListPatientsQuery,
  ): Promise<PatientWithUser[]> {
    return this.patientsService.list(actor, query);
  }

  @RequirePermission("patients.read")
  @Get(":id")
  getById(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<PatientWithUser> {
    return this.patientsService.getById(actor, params.id);
  }

  @RequirePermission("patients.write")
  @Post()
  @Audit({ action: "PATIENT_REGISTER", resourceType: "Patient" })
  register(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(registerPatientSchema)) body: RegisterPatientInput) {
    return this.patientsService.register(actor, body);
  }

  @RequirePermission("patients.write")
  @Patch(":id")
  @Audit({ action: "PATIENT_UPDATE", resourceType: "Patient" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
  ): Promise<PatientWithUser> {
    return this.patientsService.update(actor, params.id, body);
  }
}
