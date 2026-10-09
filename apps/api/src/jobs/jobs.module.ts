import { Global, Module } from "@nestjs/common";
import type { EmailProvider, NotificationJobQueue, PushProvider, SmsProvider } from "@hospital/shared";
import { AppConfigService } from "../config/config.service";
import { BullMqNotificationQueue, createBullMqRedisConnection } from "./queue/bullmq-notification-queue";
import { InProcessNotificationQueue } from "./queue/in-process-notification-queue";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { HttpEmailProvider } from "./providers/http-email.provider";
import { UnconfiguredSmsProvider } from "./providers/unconfigured-sms.provider";
import { NotificationProcessor } from "./notification.processor";
import { EMAIL_PROVIDER, NOTIFICATION_QUEUE, PUSH_PROVIDER, SMS_PROVIDER } from "./notification.tokens";

/**
 * Chooses the queue implementation from config (docs/33): a `QUEUE_BACKEND_URL`
 * means a real Redis-backed BullMQ queue, consumed by the separate worker
 * process (`worker.main.ts`); without one, jobs run immediately in-process —
 * the no-Docker dev/test path, refused in production (mirrors
 * `storage.module.ts`'s `createStorageProvider`).
 */
export function createNotificationQueue(config: AppConfigService, processor: NotificationProcessor): NotificationJobQueue {
  const { QUEUE_BACKEND_URL, NODE_ENV } = config.env;
  if (QUEUE_BACKEND_URL) {
    return new BullMqNotificationQueue(createBullMqRedisConnection(QUEUE_BACKEND_URL));
  }
  if (NODE_ENV === "production") {
    throw new Error("QUEUE_BACKEND_URL is required in production — in-process delivery is dev/test only.");
  }
  return new InProcessNotificationQueue(processor);
}

@Global()
@Module({
  providers: [
    NotificationProcessor,
    { provide: EMAIL_PROVIDER, useFactory: (config: AppConfigService): EmailProvider => new HttpEmailProvider(config.env.EMAIL_PROVIDER_ENDPOINT, config.env.EMAIL_PROVIDER_API_KEY, config.env.EMAIL_FROM_ADDRESS), inject: [AppConfigService] },
    { provide: PUSH_PROVIDER, useFactory: (config: AppConfigService): PushProvider => new ExpoPushProvider(config.env.PUSH_PROVIDER_CREDENTIALS), inject: [AppConfigService] },
    { provide: SMS_PROVIDER, useFactory: (): SmsProvider => new UnconfiguredSmsProvider() },
    { provide: NOTIFICATION_QUEUE, useFactory: createNotificationQueue, inject: [AppConfigService, NotificationProcessor] },
  ],
  exports: [NotificationProcessor, EMAIL_PROVIDER, PUSH_PROVIDER, SMS_PROVIDER, NOTIFICATION_QUEUE],
})
export class JobsModule {}
