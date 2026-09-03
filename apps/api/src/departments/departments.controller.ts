import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import {
  createDepartmentSchema,
  idParamSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
  type CreateDepartmentInput,
  type ListDepartmentsQuery,
  type UpdateDepartmentInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { DepartmentsService, type DepartmentWithDoctors } from "./departments.service";

/** docs/15-API-SPECIFICATION.md "/departments". */
@Controller("departments")
@UseInterceptors(AuditInterceptor)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @RequirePermission("departments.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listDepartmentsQuerySchema)) query: ListDepartmentsQuery,
  ): Promise<DepartmentWithDoctors[]> {
    return this.departmentsService.list(actor, query);
  }

  @RequirePermission("departments.read")
  @Get(":id")
  getById(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<DepartmentWithDoctors> {
    return this.departmentsService.getById(actor, params.id);
  }

  @RequirePermission("departments.write")
  @Post()
  @Audit({ action: "DEPARTMENT_CREATE", resourceType: "Department" })
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput) {
    return this.departmentsService.create(actor, body);
  }

  @RequirePermission("departments.write")
  @Patch(":id")
  @Audit({ action: "DEPARTMENT_UPDATE", resourceType: "Department" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartmentInput,
  ) {
    return this.departmentsService.update(actor, params.id, body);
  }
}
