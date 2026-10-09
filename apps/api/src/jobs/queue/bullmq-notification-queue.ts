import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { EnqueueOptions, NotificationJob, NotificationJobQueue } from "@hospital/shared";

export const NOTIFICATIONS_QUEUE_NAME = "notifications";

/** BullMQ requires this on blocking-command connections (its own documented requirement). */
export function createBullMqRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

/**
 * ADR-009: a Redis-backed BullMQ queue, consumed by the dedicated worker
 * process (`worker.main.ts`). Exponential backoff, base 30s, max 5 attempts
 * (docs/22 "Delivery mechanics"); `jobId` gives at-least-once redelivery
 * idempotency for free.
 */
export class BullMqNotificationQueue implements NotificationJobQueue {
  private readonly queue: Queue;

  constructor(connection: IORedis) {
    this.queue = new Queue(NOTIFICATIONS_QUEUE_NAME, { connection });
  }

  async enqueue(job: NotificationJob, options: EnqueueOptions = {}): Promise<void> {
    await this.queue.add(job.type, job, {
      jobId: options.jobId,
      delay: options.delayMs,
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }
}
