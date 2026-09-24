import { Body, Controller, Get, Post, Query, UseInterceptors } from "@nestjs/common";
import type { Allergy, MedicalCondition } from "@hospital/database";
import {
  createAllergySchema,
  createConditionSchema,
  listMedicalRecordsQuerySchema,
  medicalRecordsSubjectQuerySchema,
  type CreateAllergyInput,
  type CreateConditionInput,
  type ListMedicalRecordsQuery,
  type MedicalRecordsSubjectQuery,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { MedicalRecordsService, type MedicalRecordEntry, type MedicalRecordsSummary } from "./medical-records.service";

/** docs/15-API-SPECIFICATION.md "/medical-records". */
@Controller("medical-records")
@UseInterceptors(AuditInterceptor)
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @RequirePermission("medical_records.read")
  @Get("summary")
  summary(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(medicalRecordsSubjectQuerySchema)) query: MedicalRecordsSubjectQuery,
  ): Promise<MedicalRecordsSummary> {
    return this.medicalRecordsService.summary(actor, query);
  }

  @RequirePermission("medical_records.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listMedicalRecordsQuerySchema)) query: ListMedicalRecordsQuery,
  ): Promise<MedicalRecordEntry[]> {
    return this.medicalRecordsService.list(actor, query);
  }

  @RequirePermission("medical_records.read")
  @Get("conditions")
  listConditions(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(medicalRecordsSubjectQuerySchema)) query: MedicalRecordsSubjectQuery,
  ): Promise<MedicalCondition[]> {
    return this.medicalRecordsService.listConditions(actor, query);
  }

  @RequirePermission("medical_records.write")
  @Post("conditions")
  @Audit({ action: "MEDICAL_CONDITION_CREATE", resourceType: "MedicalCondition" })
  createCondition(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createConditionSchema)) body: CreateConditionInput): Promise<MedicalCondition> {
    return this.medicalRecordsService.createCondition(actor, body);
  }

  @RequirePermission("medical_records.read")
  @Get("allergies")
  listAllergies(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(medicalRecordsSubjectQuerySchema)) query: MedicalRecordsSubjectQuery,
  ): Promise<Allergy[]> {
    return this.medicalRecordsService.listAllergies(actor, query);
  }

  @RequirePermission("medical_records.write")
  @Post("allergies")
  @Audit({ action: "ALLERGY_CREATE", resourceType: "Allergy" })
  createAllergy(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createAllergySchema)) body: CreateAllergyInput): Promise<Allergy> {
    return this.medicalRecordsService.createAllergy(actor, body);
  }
}
