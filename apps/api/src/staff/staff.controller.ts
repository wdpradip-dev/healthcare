import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import {
  idParamSchema,
  listStaffQuerySchema,
  updateStaffSchema,
  type ListStaffQuery,
  type UpdateStaffInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { StaffService, type StaffWithUser } from "./staff.service";

/** docs/15-API-SPECIFICATION.md "/staff". */
@Controller("staff")
@UseInterceptors(AuditInterceptor)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @RequirePermission("staff.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listStaffQuerySchema)) query: ListStaffQuery,
  ): Promise<StaffWithUser[]> {
    return this.staffService.list(actor, query);
  }

  @RequirePermission("staff.read")
  @Get(":id")
  getById(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<StaffWithUser> {
    return this.staffService.getById(actor, params.id);
  }

  @RequirePermission("staff.write")
  @Patch(":id")
  @Audit({ action: "STAFF_UPDATE", resourceType: "Staff" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ): Promise<StaffWithUser> {
    return this.staffService.update(actor, params.id, body);
  }

  @RequirePermission("staff.write")
  @Post(":id/deactivate")
  @Audit({ action: "STAFF_DEACTIVATE", resourceType: "Staff" })
  deactivate(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<StaffWithUser> {
    return this.staffService.deactivate(actor, params.id);
  }
}
