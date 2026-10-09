import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

/** Not cancelled/completed/no-show — an appointment still worth reminding someone about. */
const REMINDER_ELIGIBLE_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN"] as const;

interface Threshold {
  /** Distinct per threshold so a 24h reminder and a 1h reminder for the same appointment don't suppress each other. */
  marker: "AppointmentReminder24h" | "AppointmentReminder1h";
  hoursBefore: number;
}

const THRESHOLDS: Threshold[] = [
  { marker: "AppointmentReminder24h", hoursBefore: 24 },
  { marker: "AppointmentReminder1h", hoursBefore: 1 },
];

/**
 * `APPOINTMENT_REMINDER` — docs/22-NOTIFICATIONS.md "Reminders": a scheduled
 * job (not user-triggered) that scans for appointments crossing the T-24h
 * and T-1h thresholds and sends one reminder per threshold per appointment.
 * Runs every 5 minutes and windows each threshold to that same 5 minutes
 * ([now + Nh, now + Nh + 5m)) so a given appointment is only ever *due* for a
 * scan window once; the `Notification` existence check on top of that is the
 * belt-and-braces idempotency guard docs/22 asks for — a restart mid-window,
 * or two overlapping runs, still never double-sends.
 */
@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(windowMinutes = 5): Promise<number> {
    let sent = 0;
    const now = new Date();
    for (const threshold of THRESHOLDS) {
      sent += await this.sendForThreshold(threshold, now, windowMinutes);
    }
    return sent;
  }

  private async sendForThreshold(threshold: Threshold, now: Date, windowMinutes: number): Promise<number> {
    const windowStart = new Date(now.getTime() + threshold.hoursBefore * 60 * 60_000);
    const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60_000);

    const due = await this.prisma.client.appointment.findMany({
      where: { startTime: { gte: windowStart, lt: windowEnd }, status: { in: [...REMINDER_ELIGIBLE_STATUSES] } },
      include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
    });

    let sent = 0;
    for (const appointment of due) {
      const alreadySent = await this.prisma.client.notification.findFirst({
        where: { relatedEntityType: threshold.marker, relatedEntityId: appointment.id },
      });
      if (alreadySent) continue;

      try {
        await this.notifications.notify(
          "APPOINTMENT_REMINDER",
          appointment.patient.userId,
          { doctorName: appointment.doctor.user.name, appointmentTime: appointment.startTime.toLocaleString() },
          { type: threshold.marker, id: appointment.id },
          appointment.hospitalId,
        );
        sent += 1;
      } catch (error) {
        this.logger.error(`Reminder (${threshold.marker}) failed for appointment ${appointment.id}`, error instanceof Error ? error.stack : error);
      }
    }
    return sent;
  }
}
