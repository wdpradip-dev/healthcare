import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Notification, Prisma } from "@hospital/database";
import { DomainException, type NotificationJobQueue } from "@hospital/shared";
import type { UpdateNotificationPreferencesInput, UpsertNotificationTemplateInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/types/request-user";
import { NOTIFICATION_QUEUE } from "../jobs/notification.tokens";
import { DEFAULT_TEMPLATES, EVENT_CATALOG, interpolate, type DeliveryChannel, type NotificationEvent } from "./notification-events";
import type { NotificationCategory, NotificationPreferences } from "./notifications.types";

export interface DeliveryHealthRow {
  event: string;
  channel: DeliveryChannel;
  total: number;
  sent: number;
  failed: number;
  queued: number;
}

export interface TemplateRow {
  key: NotificationEvent;
  channel: "PUSH" | "EMAIL" | "IN_APP";
  subject: string | null;
  body: string;
  isDefault: boolean;
  updatedAt: Date | null;
}

/**
 * `/notifications` — docs/15, docs/22. `notify()` is the single fan-out point
 * every triggering module calls: it always writes one durable `IN_APP` row
 * (the inbox — `GET /notifications` only ever returns these), then, for each
 * channel the event's catalog entry names, checks eligibility (an address to
 * send to exists, and — for a preference-gated event — the user hasn't
 * turned that category/channel off) and if eligible creates a `QUEUED` row
 * and enqueues a delivery job for it. Nothing here runs the delivery itself —
 * see `NotificationProcessor`.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_QUEUE) private readonly queue: NotificationJobQueue,
  ) {}

  async notify(
    event: NotificationEvent,
    userId: string,
    variables: Record<string, string> = {},
    relatedEntity?: { type: string; id: string },
    hospitalId?: string | null,
  ): Promise<void> {
    const definition = EVENT_CATALOG[event];
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      this.logger.warn(`notify(${event}): user ${userId} not found — skipped.`);
      return;
    }
    const preferences = await this.loadPreferences(userId);

    const inApp = await this.render(event, "IN_APP", hospitalId ?? null, variables);
    await this.prisma.client.notification.create({
      data: {
        userId,
        type: event,
        title: inApp.title,
        body: inApp.body,
        channel: "IN_APP",
        deliveryStatus: "DELIVERED",
        relatedEntityType: relatedEntity?.type,
        relatedEntityId: relatedEntity?.id,
      },
    });

    for (const channel of definition.channels) {
      if (!this.isEligible(channel, definition.category, preferences, user.email)) continue;

      const rendered = await this.render(event, channel, hospitalId ?? null, variables);
      const notification = await this.prisma.client.notification.create({
        data: {
          userId,
          type: event,
          title: rendered.title,
          body: rendered.body,
          channel,
          deliveryStatus: "QUEUED",
          relatedEntityType: relatedEntity?.type,
          relatedEntityId: relatedEntity?.id,
        },
      });

      const jobId = relatedEntity ? `${event}:${relatedEntity.type}:${relatedEntity.id}:${channel}` : `${event}:${userId}:${channel}:${notification.id}`;
      await this.queue.enqueue({ type: "DELIVER_NOTIFICATION", notificationId: notification.id }, { jobId });
    }
  }

  /** Transactional OTP delivery — no `User` row necessarily exists yet (pre-registration), so this bypasses notify()'s User/preference plumbing entirely (docs/22 "transactional, bypasses preferences"). */
  async sendOtpEmail(to: string, code: string): Promise<void> {
    await this.queue.enqueue({
      type: "SEND_RAW_EMAIL",
      to,
      subject: "Your verification code",
      body: `Your verification code is ${code}. It expires shortly — if you didn't request this, ignore this email.`,
    });
  }

  async list(actor: RequestUser, filter: { read?: boolean }): Promise<Notification[]> {
    return this.prisma.client.notification.findMany({
      where: { userId: actor.sub, channel: "IN_APP", ...(filter.read === undefined ? {} : { readAt: filter.read ? { not: null } : null }) },
      orderBy: { createdAt: "desc" },
    });
  }

  async markRead(actor: RequestUser, id: string): Promise<Notification> {
    const { count } = await this.prisma.client.notification.updateMany({ where: { id, userId: actor.sub, channel: "IN_APP" }, data: { readAt: new Date() } });
    if (count === 0) {
      throw new DomainException("NOT_FOUND", "Notification not found.");
    }
    return this.prisma.client.notification.findUniqueOrThrow({ where: { id } });
  }

  async markAllRead(actor: RequestUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.client.notification.updateMany({
      where: { userId: actor.sub, channel: "IN_APP", readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async updatePreferences(actor: RequestUser, input: UpdateNotificationPreferencesInput): Promise<NotificationPreferences> {
    const current = await this.loadPreferences(actor.sub);
    const merged: NotificationPreferences = {
      push: input.push ?? current.push,
      email: input.email ?? current.email,
      categories: { ...current.categories, ...input.categories },
    };
    await this.prisma.client.user.update({ where: { id: actor.sub }, data: { notificationPreferences: merged as Prisma.InputJsonValue } });
    return merged;
  }

  async getPreferences(actor: RequestUser): Promise<NotificationPreferences> {
    return this.loadPreferences(actor.sub);
  }

  /**
   * Access tokens don't carry a session id (docs/16-AUTHENTICATION.md), so
   * this targets the caller's most recently active non-revoked
   * `DeviceSession` — good enough for the common case of one active session
   * per mobile device, and simpler than threading a session claim through
   * every access token just for this. Documented simplification, see
   * docs/42-PROJECT-STATE.md known issues.
   */
  async registerPushToken(actor: RequestUser, pushToken: string): Promise<void> {
    const session = await this.prisma.client.deviceSession.findFirst({
      where: { userId: actor.sub, revokedAt: null },
      orderBy: { lastActiveAt: "desc" },
    });
    if (!session) {
      throw new DomainException("NOT_FOUND", "No active session to register this device against.");
    }
    await this.prisma.client.deviceSession.update({ where: { id: session.id }, data: { pushToken } });
  }

  /** `notifications.manage` — docs/09 "Delivery Health": success rate per event/channel. */
  async getDeliveryHealth(): Promise<DeliveryHealthRow[]> {
    const rows = await this.prisma.client.notification.groupBy({
      by: ["type", "channel", "deliveryStatus"],
      where: { channel: { in: ["PUSH", "EMAIL"] } },
      _count: { _all: true },
    });
    const byKey = new Map<string, DeliveryHealthRow>();
    for (const row of rows) {
      const key = `${row.type}:${row.channel}`;
      const entry = byKey.get(key) ?? { event: row.type, channel: row.channel as DeliveryChannel, total: 0, sent: 0, failed: 0, queued: 0 };
      entry.total += row._count._all;
      if (row.deliveryStatus === "SENT" || row.deliveryStatus === "DELIVERED") entry.sent += row._count._all;
      else if (row.deliveryStatus === "FAILED") entry.failed += row._count._all;
      else entry.queued += row._count._all;
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => a.event.localeCompare(b.event) || a.channel.localeCompare(b.channel));
  }

  /** `notifications.manage` — every (event, channel) pair, DB override merged over the built-in default. */
  async listTemplates(hospitalId: string | null): Promise<TemplateRow[]> {
    const overrides = await this.prisma.client.notificationTemplate.findMany({ where: { hospitalId } });
    const byKey = new Map(overrides.map((o) => [`${o.key}:${o.channel}`, o]));

    const rows: TemplateRow[] = [];
    for (const event of Object.keys(EVENT_CATALOG) as NotificationEvent[]) {
      const channels: ("PUSH" | "EMAIL" | "IN_APP")[] = [...EVENT_CATALOG[event].channels, "IN_APP"];
      for (const channel of channels) {
        const override = byKey.get(`${event}:${channel}`);
        const fallback = DEFAULT_TEMPLATES[event];
        rows.push({
          key: event,
          channel,
          subject: override?.subject ?? fallback.subject ?? null,
          body: override?.body ?? fallback.body,
          isDefault: !override,
          updatedAt: override?.updatedAt ?? null,
        });
      }
    }
    return rows;
  }

  async upsertTemplate(
    key: string,
    input: UpsertNotificationTemplateInput,
    actorId: string,
    hospitalId: string | null,
  ): Promise<TemplateRow> {
    if (!(key in EVENT_CATALOG)) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "key", message: "Unknown notification event." }]);
    }
    const event = key as NotificationEvent;
    // Not a Prisma `upsert()`: `hospitalId` is nullable and Prisma's generated compound-unique
    // key type for `(hospitalId, key, channel)` doesn't accept `null` (Postgres treats NULLs as
    // distinct, so it isn't a true unique target). Find-then-write instead — an acceptable
    // tradeoff for a low-traffic, admin-only action (docs/13 "NotificationTemplate").
    const existing = await this.prisma.client.notificationTemplate.findFirst({ where: { hospitalId, key: event, channel: input.channel } });
    const saved = existing
      ? await this.prisma.client.notificationTemplate.update({ where: { id: existing.id }, data: { subject: input.subject, body: input.body, updatedBy: actorId } })
      : await this.prisma.client.notificationTemplate.create({ data: { hospitalId, key: event, channel: input.channel, subject: input.subject, body: input.body, updatedBy: actorId } });
    return { key: event, channel: saved.channel as "PUSH" | "EMAIL" | "IN_APP", subject: saved.subject, body: saved.body, isDefault: false, updatedAt: saved.updatedAt };
  }

  // -- internals -------------------------------------------------------

  /** DB override (this hospital, else the platform default) wins over the built-in default — docs/13 "NotificationTemplate". */
  private async render(
    event: NotificationEvent,
    channel: "PUSH" | "EMAIL" | "IN_APP",
    hospitalId: string | null,
    variables: Record<string, string>,
  ): Promise<{ title: string; body: string }> {
    const fallback = DEFAULT_TEMPLATES[event];
    const override = hospitalId
      ? ((await this.prisma.client.notificationTemplate.findFirst({ where: { hospitalId, key: event, channel } })) ??
        (await this.prisma.client.notificationTemplate.findFirst({ where: { hospitalId: null, key: event, channel } })))
      : await this.prisma.client.notificationTemplate.findFirst({ where: { hospitalId: null, key: event, channel } });

    const body = override?.body ?? fallback.body;
    // Push/in-app templates don't carry a subject; the "title" is just the subject field's plain-text equivalent for email, and the fallback's own title otherwise.
    const title = channel === "EMAIL" ? (override?.subject ?? fallback.subject ?? fallback.title) : fallback.title;
    return { title: interpolate(title, variables), body: interpolate(body, variables) };
  }

  private async loadPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
    return (user?.notificationPreferences as NotificationPreferences | null) ?? {};
  }

  private isEligible(
    channel: DeliveryChannel,
    category: NotificationCategory | undefined,
    preferences: NotificationPreferences,
    email: string | null,
  ): boolean {
    if (channel === "EMAIL" && !email) return false;
    if (category === undefined) return true; // transactional/security — never gated
    const channelOn = channel === "PUSH" ? (preferences.push ?? true) : (preferences.email ?? true);
    const categoryOn = preferences.categories?.[category] ?? true;
    return channelOn && categoryOn;
  }
}
