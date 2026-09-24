import { Injectable, Logger } from "@nestjs/common";

export type AppointmentNotificationEvent = "BOOKED" | "RESCHEDULED" | "CANCELLED" | "CHECKED_IN" | "NO_SHOW";

/**
 * T-711: notification-trigger stub. The real notification system (queue +
 * template + delivery provider) is Phase 10 (docs/22-NOTIFICATIONS.md); until
 * then this just logs the trigger so the call sites that will need real
 * wiring already exist and are exercised, per docs/19-APPOINTMENT-ENGINE.md
 * step 8 ("commit, then — outside the transaction — enqueue the confirmation
 * notification job"). Never call this from inside a booking/reschedule/etc.
 * transaction — it's not transactional and must run only after commit.
 */
@Injectable()
export class NotificationStubService {
  private readonly logger = new Logger(NotificationStubService.name);

  trigger(event: AppointmentNotificationEvent, appointmentId: string): void {
    this.logger.log(`[STUB] Appointment notification: ${event} for ${appointmentId} (no-op until Phase 10)`);
  }
}
