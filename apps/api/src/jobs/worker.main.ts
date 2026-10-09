import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Worker } from "bullmq";
import type { NotificationJob } from "@hospital/shared";
import { AppModule } from "../app.module";
import { AppConfigService } from "../config/config.service";
import { createBullMqRedisConnection, NOTIFICATIONS_QUEUE_NAME } from "./queue/bullmq-notification-queue";
import { NotificationProcessor } from "./notification.processor";

/**
 * The dedicated worker process (ADR-009, docs/33 "apps/worker") — a headless
 * Nest application context (no HTTP server) that consumes the same BullMQ
 * queue the API process enqueues to. `pnpm --filter api worker` locally;
 * Render runs this as a separate Background Worker service built from the
 * same image with this as its start command (docs/32-DEPLOYMENT.md). Nothing
 * to do without `QUEUE_BACKEND_URL` — jobs run in-process on the API side
 * instead (`JobsModule`'s `InProcessNotificationQueue` fallback).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(AppModule);
  const config = app.get(AppConfigService).env;

  if (!config.QUEUE_BACKEND_URL) {
    logger.warn("QUEUE_BACKEND_URL is not set — nothing to consume (see docs/33). Exiting.");
    await app.close();
    return;
  }

  const processor = app.get(NotificationProcessor);
  const connection = createBullMqRedisConnection(config.QUEUE_BACKEND_URL);
  const worker = new Worker<NotificationJob>(NOTIFICATIONS_QUEUE_NAME, (job) => processor.process(job.data), { connection });

  worker.on("failed", (job, error) => {
    logger.warn(`Job ${job?.id ?? "?"} failed (attempt ${job?.attemptsMade ?? "?"}): ${error.message}`);
  });
  worker.on("completed", (job) => {
    logger.log(`Job ${job.id} delivered.`);
  });

  logger.log(`Notification worker listening on "${NOTIFICATIONS_QUEUE_NAME}".`);

  const shutdown = async () => {
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

void bootstrap();
