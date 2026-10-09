import { Global, Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AppointmentReminderService } from "./appointment-reminder.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/** Notification inbox, preferences, delivery health, templates and the reminder cron (docs/41-TASKS.md Phase 10). Global: every domain module that triggers an event injects `NotificationsService` directly. */
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController],
  providers: [NotificationsService, AppointmentReminderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
