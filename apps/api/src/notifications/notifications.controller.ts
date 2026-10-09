import { Body, Controller, Get, Param, Patch, Put, Query } from "@nestjs/common";
import { z } from "zod";
import type { Notification } from "@hospital/database";
import {
  idParamSchema,
  listNotificationsQuerySchema,
  registerPushTokenSchema,
  updateNotificationPreferencesSchema,
  upsertNotificationTemplateSchema,
  type ListNotificationsQuery,
  type RegisterPushTokenInput,
  type UpdateNotificationPreferencesInput,
  type UpsertNotificationTemplateInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { DeliveryHealthRow, NotificationsService, TemplateRow } from "./notifications.service";
import type { NotificationPreferences } from "./notifications.types";

const templateKeyParamSchema = z.object({ key: z.string().min(1) });

/** docs/15-API-SPECIFICATION.md "/notifications". `notifications.read` is always SELF scope (docs/02). */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequirePermission("notifications.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery): Promise<Notification[]> {
    return this.notificationsService.list(actor, { read: query.read });
  }

  @RequirePermission("notifications.read")
  @Patch(":id/read")
  markRead(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<Notification> {
    return this.notificationsService.markRead(actor, params.id);
  }

  @RequirePermission("notifications.read")
  @Patch("read-all")
  markAllRead(@CurrentUser() actor: RequestUser): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(actor);
  }

  @RequirePermission("notifications.read")
  @Get("preferences")
  getPreferences(@CurrentUser() actor: RequestUser): Promise<NotificationPreferences> {
    return this.notificationsService.getPreferences(actor);
  }

  @RequirePermission("notifications.read")
  @Patch("preferences")
  updatePreferences(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema)) body: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    return this.notificationsService.updatePreferences(actor, body);
  }

  @RequirePermission("notifications.read")
  @Patch("push-token")
  async registerPushToken(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(registerPushTokenSchema)) body: RegisterPushTokenInput): Promise<{ success: true }> {
    await this.notificationsService.registerPushToken(actor, body.pushToken);
    return { success: true };
  }

  @RequirePermission("notifications.manage")
  @Get("health")
  getHealth(): Promise<DeliveryHealthRow[]> {
    return this.notificationsService.getDeliveryHealth();
  }

  @RequirePermission("notifications.manage")
  @Get("templates")
  listTemplates(@CurrentUser() actor: RequestUser): Promise<TemplateRow[]> {
    // MVP ships one shared, platform-level default template set (docs/22) — every actor edits the same hospitalId=null rows.
    void actor;
    return this.notificationsService.listTemplates(null);
  }

  @RequirePermission("notifications.manage")
  @Put("templates/:key")
  upsertTemplate(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(templateKeyParamSchema)) params: { key: string },
    @Body(new ZodValidationPipe(upsertNotificationTemplateSchema)) body: UpsertNotificationTemplateInput,
  ): Promise<TemplateRow> {
    return this.notificationsService.upsertTemplate(params.key, body, actor.sub, null);
  }
}
