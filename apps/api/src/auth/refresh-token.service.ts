import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DomainException, generateOpaqueToken, hashOpaqueToken } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface IssuedRefreshToken {
  rawToken: string;
  familyId: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
  sessionId: string;
}

/**
 * Refresh token rotation and reuse detection, per docs/16-AUTHENTICATION.md
 * "Tokens": every use issues a new token and invalidates the old one, both
 * linked by `familyId`. Presenting an already-rotated token revokes the
 * entire family immediately — the standard defense against a stolen refresh
 * token being replayed alongside the legitimate one.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async issue(userId: string, sessionId: string, ttlMs: number): Promise<IssuedRefreshToken> {
    const familyId = randomUUID();
    return this.createToken(userId, sessionId, familyId, ttlMs);
  }

  /**
   * Validates and rotates a presented refresh token. Throws
   * `AUTH_SESSION_EXPIRED` for an unknown/expired/already-revoked token, and
   * `AUTH_REFRESH_TOKEN_REUSED` — after revoking the whole family — if the
   * token was already used in a prior rotation.
   */
  async rotate(rawToken: string, ttlMs: number, context: { ipAddress?: string; userAgent?: string }): Promise<RotatedRefreshToken> {
    const tokenHash = hashOpaqueToken(rawToken);
    const existing = await this.prisma.client.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw new DomainException("AUTH_SESSION_EXPIRED", "Your session has expired. Please log in again.");
    }

    if (existing.isUsed) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(`Refresh token reuse detected for user ${existing.userId}, family ${existing.familyId}`);
      await this.auditService.record({
        actorUserId: existing.userId,
        actorRole: "SYSTEM",
        action: "AUTH_REFRESH_REUSE_DETECTED",
        resourceType: "User",
        resourceId: existing.userId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      });
      throw new DomainException(
        "AUTH_REFRESH_TOKEN_REUSED",
        "A security issue was detected with your session. Please log in again.",
      );
    }

    await this.prisma.client.refreshToken.update({
      where: { id: existing.id },
      data: { isUsed: true },
    });

    const next = await this.createToken(existing.userId, existing.sessionId, existing.familyId, ttlMs);
    return { ...next, userId: existing.userId, sessionId: existing.sessionId };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.client.deviceSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.client.deviceSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  private async createToken(userId: string, sessionId: string, familyId: string, ttlMs: number): Promise<IssuedRefreshToken> {
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        sessionId,
        familyId,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt,
      },
    });
    return { rawToken, familyId, expiresAt };
  }
}
