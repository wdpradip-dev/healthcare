import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from "@nestjs/common";
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  markNoShowSchema,
  rescheduleAppointmentSchema,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type ListAppointmentsQuery,
  type MarkNoShowInput,
  type RescheduleAppointmentInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import type { RequestUser } from "../common/types/request-user";
import { AppointmentsService } from "./appointments.service";
import { AppointmentTransitionsService } from "./appointment-transitions.service";

/** docs/15-API-SPECIFICATION.md "/appointments". */
@Controller("appointments")
@UseInterceptors(AuditInterceptor)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly transitionsService: AppointmentTransitionsService,
  ) {}

  @RequirePermission("appointments.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listAppointmentsQuerySchema)) query: ListAppointmentsQuery) {
    return this.appointmentsService.list(actor, query);
  }

  @RequirePermission("appointments.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.appointmentsService.getById(actor, params.id);
  }

  @RequirePermission("appointments.create")
  @Post()
  @Audit({ action: "APPOINTMENT_CREATE", resourceType: "Appointment" })
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput) {
    return this.appointmentsService.create(actor, body);
  }

  @RequirePermission("appointments.update")
  @Patch(":id/reschedule")
  @Audit({ action: "APPOINTMENT_RESCHEDULE", resourceType: "Appointment" })
  reschedule(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(rescheduleAppointmentSchema)) body: RescheduleAppointmentInput,
  ) {
    return this.transitionsService.reschedule(actor, params.id, body);
  }

  @RequirePermission("appointments.cancel")
  @Patch(":id/cancel")
  @Audit({ action: "APPOINTMENT_CANCEL", resourceType: "Appointment" })
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(cancelAppointmentSchema)) body: CancelAppointmentInput,
  ) {
    return this.transitionsService.cancel(actor, params.id, body);
  }

  @RequirePermission("appointments.checkin")
  @Post(":id/checkin")
  @Audit({ action: "APPOINTMENT_CHECKIN", resourceType: "Appointment" })
  checkin(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.transitionsService.checkin(actor, params.id);
  }

  @RequirePermission("appointments.update")
  @Patch(":id/no-show")
  @Audit({ action: "APPOINTMENT_NO_SHOW", resourceType: "Appointment" })
  markNoShow(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(markNoShowSchema)) body: MarkNoShowInput,
  ) {
    return this.transitionsService.markNoShow(actor, params.id, body);
  }
}
