import { Logger } from "@nestjs/common";
import type { EnqueueOptions, NotificationJob, NotificationJobQueue } from "@hospital/shared";
import type { NotificationProcessor } from "../notification.processor";

/**
 * The no-Docker dev/test fallback (docs/33, mirrors `LocalDiskStorageProvider`):
 * no Redis, so a job runs in-process instead of round-tripping through a real
 * queue. `enqueue()` itself still returns immediately without waiting for the
 * job to run — the point of a queue is that the caller doesn't block on
 * delivery (docs/22 "Delivery mechanics"), and that stays true here even
 * though there's no separate process consuming it. No retry/backoff — a
 * failure is logged and swallowed, since this path never had the durability
 * `QUEUE_BACKEND_URL`/BullMQ provide in the first place. Refused in production.
 */
export class InProcessNotificationQueue implements NotificationJobQueue {
  private readonly logger = new Logger(InProcessNotificationQueue.name);

  constructor(private readonly processor: NotificationProcessor) {}

  async enqueue(job: NotificationJob, _options?: EnqueueOptions): Promise<void> {
    void this.processor.process(job).catch((error) => {
      this.logger.warn(`In-process delivery failed for ${job.type}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
