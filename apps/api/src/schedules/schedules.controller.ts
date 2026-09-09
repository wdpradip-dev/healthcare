import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseInterceptors } from "@nestjs/common";
import { z } from "zod";
import {
  availabilityQuerySchema,
  createScheduleExceptionSchema,
  idParamSchema,
  listScheduleExceptionsQuerySchema,
  replaceDoctorScheduleSchema,
  type AvailabilityQuery,
  type CreateScheduleExceptionInput,
  type ListScheduleExceptionsQuery,
  type ReplaceDoctorScheduleInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { AvailabilityService } from "./availability.service";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { ScheduleExceptionService } from "./schedule-exception.service";

const doctorIdParamSchema = z.object({ doctorId: idParamSchema.shape.id });
const doctorAndExceptionIdParamSchema = z.object({ doctorId: idParamSchema.shape.id, id: idParamSchema.shape.id });

/** docs/15-API-SPECIFICATION.md "/schedules". Route order matters: `/availability`
 * must be declared ahead of `:doctorId` so Nest doesn't treat "availability"
 * as a doctorId param. */
@Controller("schedules")
@UseInterceptors(AuditInterceptor)
export class SchedulesController {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly doctorScheduleService: DoctorScheduleService,
    private readonly scheduleExceptionService: ScheduleExceptionService,
  ) {}

  @RequirePermission("schedules.read")
  @Get("availability")
  getAvailability(@Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery) {
    return this.availabilityService.computeForDoctor(query);
  }

  @RequirePermission("schedules.read")
  @Get(":doctorId")
  getWeeklyTemplate(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(doctorIdParamSchema)) params: { doctorId: string }) {
    return this.doctorScheduleService.getWeeklyTemplate(actor, params.doctorId);
  }

  @RequirePermission("schedules.write")
  @Put(":doctorId")
  @Audit({ action: "SCHEDULE_UPDATE", resourceType: "DoctorSchedule" })
  replaceWeeklyTemplate(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(doctorIdParamSchema)) params: { doctorId: string },
    @Body(new ZodValidationPipe(replaceDoctorScheduleSchema)) body: ReplaceDoctorScheduleInput,
  ) {
    return this.doctorScheduleService.replaceWeeklyTemplate(actor, params.doctorId, body);
  }

  @RequirePermission("schedules.read")
  @Get(":doctorId/exceptions")
  listExceptions(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(doctorIdParamSchema)) params: { doctorId: string },
    @Query(new ZodValidationPipe(listScheduleExceptionsQuerySchema)) query: ListScheduleExceptionsQuery,
  ) {
    return this.scheduleExceptionService.list(actor, params.doctorId, query);
  }

  @RequirePermission("schedules.write")
  @Post(":doctorId/exceptions")
  @Audit({ action: "SCHEDULE_EXCEPTION_CREATE", resourceType: "ScheduleException" })
  createException(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(doctorIdParamSchema)) params: { doctorId: string },
    @Body(new ZodValidationPipe(createScheduleExceptionSchema)) body: CreateScheduleExceptionInput,
  ) {
    return this.scheduleExceptionService.create(actor, params.doctorId, body);
  }

  @RequirePermission("schedules.write")
  @Delete(":doctorId/exceptions/:id")
  @Audit({ action: "SCHEDULE_EXCEPTION_DELETE", resourceType: "ScheduleException" })
  removeException(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(doctorAndExceptionIdParamSchema)) params: { doctorId: string; id: string },
  ) {
    return this.scheduleExceptionService.remove(actor, params.doctorId, params.id);
  }
}
