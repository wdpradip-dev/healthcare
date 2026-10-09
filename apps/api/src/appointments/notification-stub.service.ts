import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { NotificationEvent } from "../notifications/notification-events";

export type AppointmentNotificationEvent = "BOOKED" | "RESCHEDULED" | "CANCELLED" | "CHECKED_IN" | "NO_SHOW" | "CONSULTATION_COMPLETED";

const EVENT_MAP: Partial<Record<AppointmentNotificationEvent, NotificationEvent>> = {
  BOOKED: "APPOINTMENT_BOOKED",
  RESCHEDULED: "APPOINTMENT_RESCHEDULED",
  CANCELLED: "APPOINTMENT_CANCELLED",
  CHECKED_IN: "CHECKED_IN",
  CONSULTATION_COMPLETED: "CONSULTATION_COMPLETE",
  // NO_SHOW has no patient-facing entry in docs/22's event catalog — deliberately a no-op.
};

/**
 * The appointment/consultation lifecycle's one call site into the real
 * notification system (docs/22-NOTIFICATIONS.md, docs/41-TASKS.md Phase 10).
 * Kept as its own small adapter (rather than every call site injecting
 * `NotificationsService` directly) so `appointments.service.ts` and
 * `appointment-transitions.service.ts` only need an appointment id, and the
 * "never call this from inside a booking transaction, only after commit"
 * contract stays centralized in one file. `await`ed by callers, but never
 * lets a failure propagate: creating the durable in-app row is a couple of
 * fast local writes (worth waiting on — it's the one users actually see,
 * "immediately"), while the slow/unreliable part — actually calling a
 * push/email provider — happens inside the queued job, decoupled from this
 * call entirely (docs/22 "Delivery mechanics").
 */
@Injectable()
export class NotificationStubService {
  private readonly logger = new Logger(NotificationStubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async trigger(event: AppointmentNotificationEvent, appointmentId: string): Promise<void> {
    await this.deliver(event, appointmentId).catch((error) => {
      this.logger.error(`Notification trigger ${event} for appointment ${appointmentId} failed`, error instanceof Error ? error.stack : error);
    });
  }

  private async deliver(event: AppointmentNotificationEvent, appointmentId: string): Promise<void> {
    const notificationEvent = EVENT_MAP[event];
    if (!notificationEvent) return;

    const appointment = await this.prisma.client.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
    });
    if (!appointment) return;

    await this.notifications.notify(
      notificationEvent,
      appointment.patient.userId,
      { doctorName: appointment.doctor.user.name, appointmentTime: appointment.startTime.toLocaleString() },
      { type: "Appointment", id: appointment.id },
      appointment.hospitalId,
    );
  }
}
