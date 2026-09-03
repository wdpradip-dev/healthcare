import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import type { Branch } from "@hospital/database";
import {
  createBranchSchema,
  idParamSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
  type CreateBranchInput,
  type ListBranchesQuery,
  type UpdateBranchInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { BranchesService } from "./branches.service";

/** docs/15-API-SPECIFICATION.md "/branches". */
@Controller("branches")
@UseInterceptors(AuditInterceptor)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @RequirePermission("branches.read")
  @Get()
  list(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(listBranchesQuerySchema)) query: ListBranchesQuery,
  ): Promise<Branch[]> {
    return this.branchesService.list(actor, query);
  }

  @RequirePermission("branches.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<Branch> {
    return this.branchesService.getById(actor, params.id);
  }

  @RequirePermission("branches.write")
  @Post()
  @Audit({ action: "BRANCH_CREATE", resourceType: "Branch" })
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput,
  ): Promise<Branch> {
    return this.branchesService.create(actor, body);
  }

  @RequirePermission("branches.write")
  @Patch(":id")
  @Audit({ action: "BRANCH_UPDATE", resourceType: "Branch" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
  ): Promise<Branch> {
    return this.branchesService.update(actor, params.id, body);
  }
}
