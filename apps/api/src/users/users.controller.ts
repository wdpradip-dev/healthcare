import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseInterceptors, UsePipes } from "@nestjs/common";
import type { Request } from "express";
import {
  activateUserSchema,
  idParamSchema,
  inviteUserSchema,
  listUsersQuerySchema,
  requestActivationOtpSchema,
  updateUserSchema,
  type ActivateUserInput,
  type InviteUserInput,
  type ListUsersQuery,
  type RequestActivationOtpInput,
  type UpdateUserInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import type { RequestContext } from "../auth/auth.service";
import { UsersService } from "./users.service";

/** docs/15-API-SPECIFICATION.md "/users". Route order matters: the two
 * `/activate*` routes must be declared ahead of `:id` so Nest doesn't treat
 * "activate" as an id param. */
@Controller("users")
@UseInterceptors(AuditInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post("activate/request-otp")
  @UsePipes(new ZodValidationPipe(requestActivationOtpSchema))
  requestActivationOtp(@Body() body: RequestActivationOtpInput) {
    return this.usersService.requestActivationOtp(body.activationToken);
  }

  @Public()
  @Post("activate")
  @UsePipes(new ZodValidationPipe(activateUserSchema))
  async activate(@Body() body: ActivateUserInput) {
    await this.usersService.activate(body);
    return { success: true };
  }

  @RequirePermission("users.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.usersService.list(actor, query);
  }

  @RequirePermission("users.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.usersService.getById(actor, params.id);
  }

  @RequirePermission("users.manage")
  @Post("invite")
  @Audit({ action: "USER_INVITE", resourceType: "User" })
  invite(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
    @Req() req: Request,
  ) {
    return this.usersService.invite(actor, body, contextFrom(req));
  }

  @RequirePermission("users.manage")
  @Patch(":id")
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @Req() req: Request,
  ) {
    return this.usersService.update(actor, params.id, body, contextFrom(req));
  }

  @RequirePermission("users.manage")
  @Post(":id/deactivate")
  deactivate(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }, @Req() req: Request) {
    return this.usersService.deactivate(actor, params.id, contextFrom(req));
  }
}

function contextFrom(req: Request): RequestContext {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"], platform: "WEB" };
}
