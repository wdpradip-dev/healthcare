import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { DomainException, hashPassword } from "@hospital/shared";
import type { InviteUserInput, ListUsersQuery, UpdateUserInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ActivationTokenService } from "../common/jwt/activation-token.service";
import { OtpService } from "../auth/otp.service";
import { RefreshTokenService } from "../auth/refresh-token.service";
import { maskIdentifier } from "../auth/mask-identifier.util";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";
import type { RequestContext } from "../auth/auth.service";

/**
 * Staff/doctor invite → activate → deactivate lifecycle, per
 * docs/16-AUTHENTICATION.md "Staff activation" and
 * docs/15-API-SPECIFICATION.md "/users". Patients are never managed here —
 * they self-register via `/auth/register`.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  // Dev-only accessor for tests, mirrors OtpService's own pattern — no real
  // email provider exists until Phase 10, see deliverActivationLink().
  private readonly lastActivationTokenByUserId = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly activationTokenService: ActivationTokenService,
    private readonly otpService: OtpService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async list(actor: RequestUser, query: ListUsersQuery) {
    const hospitalId = resolveHospitalId(actor, query.hospitalId);
    return this.prisma.client.user.findMany({
      where: {
        hospitalId,
        status: query.status,
        ...(query.branchId ? { staff: { branchId: query.branchId } } : {}),
        ...(query.role ? { userRoles: { some: { role: { key: query.role } } } } : {}),
        ...(query.query
          ? { OR: [{ name: { contains: query.query, mode: "insensitive" } }, { email: { contains: query.query, mode: "insensitive" } }] }
          : {}),
      },
      include: { userRoles: { include: { role: true } }, staff: true },
      orderBy: { name: "asc" },
    });
  }

  async getById(actor: RequestUser, id: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } }, staff: true },
    });
    if (!user || (actor.hospitalId && user.hospitalId !== actor.hospitalId)) {
      throw new DomainException("NOT_FOUND", "User not found.");
    }
    return user;
  }

  async invite(actor: RequestUser, input: InviteUserInput, context: RequestContext) {
    const hospitalId = resolveHospitalId(actor, input.hospitalId);

    const existing = await this.prisma.client.user.findFirst({
      where: { OR: [input.email ? { email: input.email } : undefined, input.phone ? { phone: input.phone } : undefined].filter(
        (clause): clause is { email: string } | { phone: string } => clause !== undefined,
      ) },
    });
    if (existing) {
      throw new DomainException("AUTH_EMAIL_ALREADY_EXISTS", "This email or phone is already registered.");
    }

    const role = await this.prisma.client.role.findFirst({ where: { hospitalId: null, key: input.roleKey } });
    if (!role) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "roleKey", message: "Unknown role." },
      ]);
    }

    // Never usable: a random value the invitee cannot know, hashed the same
    // way a real password would be. Overwritten with a real password hash
    // when the invitee completes activate() — a PENDING_ACTIVATION user can
    // never log in via /auth/login regardless (see auth.service.ts login()),
    // so this is defense-in-depth, not the primary guard.
    const placeholderPasswordHash = await hashPassword(randomBytes(32).toString("hex"));

    const isStaffRole = input.roleKey === "NURSE" || input.roleKey === "RECEPTIONIST" || input.roleKey === "ADMIN";

    const user = await this.prisma.client.user.create({
      data: {
        hospitalId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: placeholderPasswordHash,
        status: "PENDING_ACTIVATION",
        userRoles: { create: { roleId: role.id } },
        ...(isStaffRole
          ? { staff: { create: { hospitalId, branchId: input.branchId, jobTitle: input.jobTitle } } }
          : {}),
      },
    });

    const activationToken = this.activationTokenService.sign(user.id);
    this.deliverActivationLink(user.id, input.email ?? input.phone!, activationToken);

    await this.auditService.record({
      hospitalId,
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? "ADMIN",
      action: "USER_INVITE",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { userId: user.id, status: user.status, roleKey: input.roleKey };
  }

  async requestActivationOtp(activationToken: string) {
    const userId = this.activationTokenService.verify(activationToken);
    if (!userId) {
      throw new DomainException("AUTH_ACTIVATION_TOKEN_INVALID", "This activation link is invalid or has expired.");
    }
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "PENDING_ACTIVATION") {
      throw new DomainException("AUTH_ACTIVATION_TOKEN_INVALID", "This activation link is invalid or has expired.");
    }

    const identifier = user.email ?? user.phone!;
    const existingChallenge = await this.prisma.client.otpChallenge.findFirst({
      where: { identifier, purpose: "ACCOUNT_ACTIVATION", consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const { challenge } = existingChallenge
      ? await this.otpService.resendChallenge(existingChallenge.id)
      : await this.otpService.createChallenge(identifier, "ACCOUNT_ACTIVATION");

    return { otpChallengeId: challenge.id, otpDeliveredTo: maskIdentifier(identifier) };
  }

  async activate(input: { activationToken: string; otpChallengeId: string; code: string; password: string }) {
    const userId = this.activationTokenService.verify(input.activationToken);
    if (!userId) {
      throw new DomainException("AUTH_ACTIVATION_TOKEN_INVALID", "This activation link is invalid or has expired.");
    }
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "PENDING_ACTIVATION") {
      throw new DomainException("AUTH_ACTIVATION_TOKEN_INVALID", "This activation link is invalid or has expired.");
    }

    const challenge = await this.otpService.verify(input.otpChallengeId, input.code);
    const identifier = user.email ?? user.phone!;
    if (challenge.purpose !== "ACCOUNT_ACTIVATION" || challenge.identifier !== identifier) {
      throw new DomainException("AUTH_OTP_INVALID", "Invalid or already-used code.");
    }

    const passwordHash = await hashPassword(input.password);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "ACTIVE" },
    });
    await this.otpService.consume(challenge.id);

    await this.auditService.record({
      hospitalId: user.hospitalId,
      actorUserId: user.id,
      actorRole: "USER",
      action: "USER_ACTIVATE",
      resourceType: "User",
      resourceId: user.id,
    });
  }

  async update(actor: RequestUser, id: string, input: UpdateUserInput, context: RequestContext) {
    await this.getById(actor, id);

    if (input.roleKey) {
      const role = await this.prisma.client.role.findFirst({ where: { hospitalId: null, key: input.roleKey } });
      if (!role) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "roleKey", message: "Unknown role." },
        ]);
      }
      await this.prisma.client.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.client.userRole.create({ data: { userId: id, roleId: role.id } });
      await this.auditService.record({
        hospitalId: actor.hospitalId,
        actorUserId: actor.sub,
        actorRole: actor.roles[0] ?? "ADMIN",
        action: "ROLE_ASSIGN",
        resourceType: "User",
        resourceId: id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    if (input.status === "DISABLED") {
      return this.deactivate(actor, id, context);
    }
    if (input.status === "ACTIVE") {
      await this.prisma.client.user.update({ where: { id }, data: { status: "ACTIVE" } });
    }

    return this.getById(actor, id);
  }

  async deactivate(actor: RequestUser, id: string, context: RequestContext) {
    const user = await this.getById(actor, id);
    await this.prisma.client.user.update({ where: { id }, data: { status: "DISABLED" } });
    await this.refreshTokenService.revokeAllForUser(id);

    await this.auditService.record({
      hospitalId: user.hospitalId,
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? "ADMIN",
      action: "USER_DEACTIVATE",
      resourceType: "User",
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getById(actor, id);
  }

  /**
   * Delivery stub — mirrors OtpService.deliver()'s exact rationale: no real
   * email provider exists until Phase 10's notification system, so this
   * logs the activation link for local development/manual testing and is
   * never acceptable in a real deployment (docs/42-PROJECT-STATE.md known issues).
   */
  private deliverActivationLink(userId: string, identifier: string, activationToken: string): void {
    this.logger.warn(`[DEV ONLY] Activation link for ${maskIdentifier(identifier)}: token=${activationToken}`);
    if (process.env.NODE_ENV !== "production") {
      this.lastActivationTokenByUserId.set(userId, activationToken);
    }
  }

  /** Test-only accessor — see deliverActivationLink(). */
  getLastActivationTokenForTesting(userId: string): string | undefined {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    return this.lastActivationTokenByUserId.get(userId);
  }
}
