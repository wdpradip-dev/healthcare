/**
 * The job queue abstraction behind async delivery (docs/22, [ADR-009]) — a
 * durable, retryable Redis-backed queue (BullMQ) in staging/production, and
 * an in-process immediate-run fallback for the no-Docker dev/test path
 * (`InProcessNotificationQueue`, mirroring `LocalDiskStorageProvider`).
 */
export type NotificationJob =
  | { type: "DELIVER_NOTIFICATION"; notificationId: string }
  | { type: "SEND_RAW_EMAIL"; to: string; subject: string; body: string };

export interface EnqueueOptions {
  /** Deterministic idempotency key (docs/22 "Idempotency") — a redelivery with the same id is deduplicated. */
  jobId?: string;
  delayMs?: number;
}

export interface NotificationJobQueue {
  enqueue(job: NotificationJob, options?: EnqueueOptions): Promise<void>;
}
