import { Inject, Injectable, Logger } from "@nestjs/common";
import type { EmailProvider, NotificationJob, PushProvider } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER, PUSH_PROVIDER } from "./notification.tokens";

/**
 * The actual delivery work behind a queued job — shared by the real BullMQ
 * `Worker` (`worker.main.ts`) and `InProcessNotificationQueue` (dev/test, no
 * Redis), so "what happens when a job runs" is written once. A `PUSH`
 * notification fans out to every one of the user's non-revoked device
 * sessions that carry a token; the row is `SENT` if at least one succeeds.
 */
@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: PushProvider,
  ) {}

  async process(job: NotificationJob): Promise<void> {
    if (job.type === "SEND_RAW_EMAIL") {
      await this.emailProvider.send({ to: job.to, subject: job.subject, body: job.body });
      return;
    }
    await this.deliver(job.notificationId);
  }

  private async deliver(notificationId: string): Promise<void> {
    const notification = await this.prisma.client.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true } } },
    });
    if (!notification || notification.channel === "IN_APP") {
      // IN_APP rows are marked DELIVERED at creation (NotificationsService) — never queued.
      return;
    }

    let delivered = false;
    let error: string | null = null;
    try {
      if (notification.channel === "EMAIL") {
        if (!notification.user.email) {
          error = "User has no email address.";
        } else {
          delivered = await this.emailProvider.send({ to: notification.user.email, subject: notification.title, body: notification.body });
          if (!delivered) error = "Email provider rejected or is unconfigured.";
        }
      } else if (notification.channel === "PUSH") {
        const sessions = await this.prisma.client.deviceSession.findMany({
          where: { userId: notification.userId, revokedAt: null, pushToken: { not: null } },
          select: { pushToken: true },
        });
        if (sessions.length === 0) {
          error = "No registered push token.";
        } else {
          const results = await Promise.all(
            sessions.map((s) => this.pushProvider.send({ token: s.pushToken!, title: notification.title, body: notification.body })),
          );
          delivered = results.some(Boolean);
          if (!delivered) error = "Push provider rejected or is unconfigured.";
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    await this.prisma.client.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: delivered ? "SENT" : "FAILED",
        attempts: { increment: 1 },
        lastError: delivered ? null : error,
      },
    });

    if (!delivered) {
      this.logger.warn(`Notification ${notificationId} (${notification.channel}) delivery failed: ${error}`);
      throw new Error(error ?? "Delivery failed");
    }
  }
}
