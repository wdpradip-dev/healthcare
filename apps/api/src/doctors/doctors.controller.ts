import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import {
  assignDoctorDepartmentSchema,
  createDoctorSchema,
  idParamSchema,
  listDoctorsQuerySchema,
  updateDoctorSchema,
  type AssignDoctorDepartmentInput,
  type CreateDoctorInput,
  type ListDoctorsQuery,
  type UpdateDoctorInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import type { Doctor } from "@hospital/database";
import { DoctorsService, type DoctorWithRelations } from "./doctors.service";

/** docs/15-API-SPECIFICATION.md "/doctors". */
@Controller("doctors")
@UseInterceptors(AuditInterceptor)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @RequirePermission("doctors.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listDoctorsQuerySchema)) query: ListDoctorsQuery,
  ): Promise<DoctorWithRelations[]> {
    return this.doctorsService.list(actor, query);
  }

  @RequirePermission("doctors.read")
  @Get(":id")
  getById(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<DoctorWithRelations> {
    return this.doctorsService.getById(actor, params.id);
  }

  @RequirePermission("doctors.write")
  @Post()
  @Audit({ action: "DOCTOR_CREATE", resourceType: "Doctor" })
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createDoctorSchema)) body: CreateDoctorInput): Promise<Doctor> {
    return this.doctorsService.create(actor, body);
  }

  @RequirePermission("doctors.write")
  @Patch(":id")
  @Audit({ action: "DOCTOR_UPDATE", resourceType: "Doctor" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateDoctorSchema)) body: UpdateDoctorInput,
  ): Promise<Doctor> {
    return this.doctorsService.update(actor, params.id, body);
  }

  @RequirePermission("doctors.write")
  @Post(":id/departments")
  @Audit({ action: "DOCTOR_DEPARTMENT_ASSIGN", resourceType: "Doctor" })
  assignDepartment(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(assignDoctorDepartmentSchema)) body: AssignDoctorDepartmentInput,
  ): Promise<DoctorWithRelations> {
    return this.doctorsService.assignDepartment(actor, params.id, body);
  }

  @RequirePermission("doctors.write")
  @Delete(":id/departments/:departmentId")
  @Audit({ action: "DOCTOR_DEPARTMENT_REMOVE", resourceType: "Doctor" })
  removeDepartment(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Param("departmentId", new ZodValidationPipe(idParamSchema.shape.id)) departmentId: string,
  ): Promise<DoctorWithRelations> {
    return this.doctorsService.removeDepartment(actor, params.id, departmentId);
  }
}
