import { Injectable, Logger } from "@nestjs/common";
import { randomInt } from "node:crypto";
import type { OtpChallenge, OtpPurpose } from "@hospital/database";
import { DomainException, hashPassword, verifyPassword } from "@hospital/shared";
import { PrismaService } from "../prisma/prisma.service";
import { maskIdentifier } from "./mask-identifier.util";

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;
const RESEND_HOURLY_CAP = 5;

/**
 * OTP issuance/verification per docs/16-AUTHENTICATION.md "OTP": 6-digit
 * numeric, 5-minute TTL, max 5 verify attempts, 30s resend cooldown, max 5
 * resends/hour. Codes are hashed at rest (never stored plaintext), same
 * hashing utility as passwords for one less thing to get wrong.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly lastDeliveredCodeByIdentifier = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async createChallenge(identifier: string, purpose: OtpPurpose): Promise<{ challenge: OtpChallenge; code: string }> {
    const code = generateCode();
    const codeHash = await hashPassword(code);
    const challenge = await this.prisma.client.otpChallenge.create({
      data: {
        identifier,
        purpose,
        codeHash,
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    });

    this.deliver(identifier, code);
    return { challenge, code };
  }

  async resendChallenge(otpChallengeId: string): Promise<{ challenge: OtpChallenge; code: string }> {
    const previous = await this.prisma.client.otpChallenge.findUnique({ where: { id: otpChallengeId } });
    if (!previous) {
      throw new DomainException("AUTH_OTP_EXPIRED", "This code has expired. Please start again.");
    }

    const sinceCreated = (Date.now() - previous.createdAt.getTime()) / 1000;
    if (sinceCreated < RESEND_COOLDOWN_SECONDS) {
      throw new DomainException(
        "RATE_LIMITED",
        `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - sinceCreated)}s before requesting another code.`,
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const recentCount = await this.prisma.client.otpChallenge.count({
      where: { identifier: previous.identifier, purpose: previous.purpose, createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= RESEND_HOURLY_CAP) {
      throw new DomainException("RATE_LIMITED", "Too many code requests. Please try again later.");
    }

    // Invalidate the old challenge so a stale code can never be used after a resend.
    await this.prisma.client.otpChallenge.update({
      where: { id: previous.id },
      data: { consumedAt: new Date() },
    });

    return this.createChallenge(previous.identifier, previous.purpose);
  }

  /**
   * Verifies a code without consuming the challenge — used when a caller
   * needs to confirm the code THEN perform another action (e.g. reset-password
   * sets a new password only after the code checks out) atomically with
   * consumption. Call `consume()` once the dependent action has succeeded.
   */
  async verify(otpChallengeId: string, code: string): Promise<OtpChallenge> {
    const challenge = await this.prisma.client.otpChallenge.findUnique({ where: { id: otpChallengeId } });
    if (!challenge || challenge.consumedAt) {
      throw new DomainException("AUTH_OTP_INVALID", "Invalid or already-used code.");
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new DomainException("AUTH_OTP_EXPIRED", "This code has expired. Please request a new one.");
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new DomainException("AUTH_OTP_MAX_ATTEMPTS", "Too many incorrect attempts. Please request a new code.");
    }

    const isValid = await verifyPassword(challenge.codeHash, code);
    if (!isValid) {
      await this.prisma.client.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new DomainException("AUTH_OTP_INVALID", "Incorrect code.");
    }

    return challenge;
  }

  async consume(otpChallengeId: string): Promise<void> {
    await this.prisma.client.otpChallenge.update({
      where: { id: otpChallengeId },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * Delivery stub. Real email/SMS delivery is the notification system built
   * in Phase 10 (docs/22-NOTIFICATIONS.md) — OTP delivery is a transactional
   * send that bypasses user preferences there. Until that queue/provider
   * exists, this logs the code so local development and manual testing can
   * proceed; it is never acceptable in a real deployment and is called out
   * explicitly in docs/42-PROJECT-STATE.md as a known gap to close before then.
   */
  private deliver(identifier: string, code: string): void {
    this.logger.warn(`[DEV ONLY] OTP for ${maskIdentifier(identifier)}: ${code}`);
    if (process.env.NODE_ENV !== "production") {
      this.lastDeliveredCodeByIdentifier.set(identifier, code);
    }
  }

  /**
   * Test-only accessor for the last code "delivered" to an identifier —
   * integration tests (apps/api/test/auth.integration-spec.ts) have no other
   * way to complete an OTP flow, since `codeHash` is one-way and the real
   * API response never includes the plaintext code. Never called from any
   * controller; only ever meaningful outside production, where `deliver()`
   * doesn't populate the map at all.
   */
  getLastDeliveredCodeForTesting(identifier: string): string | undefined {
    return this.lastDeliveredCodeByIdentifier.get(identifier);
  }
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
