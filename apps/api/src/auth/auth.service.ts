import { Injectable, Logger } from "@nestjs/common";
import { DomainException, hashPassword, parseDurationToMs, verifyPassword } from "@hospital/shared";
import type { SystemRole } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppConfigService } from "../config/config.service";
import { AccessTokenService } from "../common/jwt/access-token.service";
import { OtpService } from "./otp.service";
import { RefreshTokenService } from "./refresh-token.service";
import { AuthzResolverService } from "./authz-resolver.service";
import { maskIdentifier } from "./mask-identifier.util";
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from "@hospital/validation";

const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
const FAILED_LOGIN_LOCKOUT_MINUTES = 15;

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
  platform: "IOS" | "ANDROID" | "WEB";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    hospitalId: string | null;
    roles: SystemRole[];
    permissions: string[];
  };
}

/**
 * Implements every flow in docs/16-AUTHENTICATION.md and docs/04-FEATURE-SPECIFICATION.md
 * "Domain: Authentication". Deliberately Patient-registration only — Doctor/
 * Nurse/Receptionist/Admin accounts are invite-only, built in Phase 4's
 * Users module (docs/16-AUTHENTICATION.md "Staff activation").
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly authzResolver: AuthzResolverService,
    private readonly accessTokenService: AccessTokenService,
    private readonly auditService: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async register(input: RegisterInput, context: RequestContext) {
    const existing = await this.prisma.client.user.findFirst({
      where: {
        OR: [input.email ? { email: input.email } : undefined, input.phone ? { phone: input.phone } : undefined].filter(
          (clause): clause is { email: string } | { phone: string } => clause !== undefined,
        ),
      },
    });
    if (existing) {
      throw new DomainException("AUTH_EMAIL_ALREADY_EXISTS", "This email or phone is already registered.");
    }

    const patientRole = await this.getSystemRole("PATIENT");
    const passwordHash = await hashPassword(input.password);

    const user = await this.prisma.client.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        status: "PENDING_ACTIVATION",
        patient: { create: {} },
        userRoles: { create: { roleId: patientRole.id } },
      },
    });

    const identifier = input.email ?? input.phone!;
    const { challenge } = await this.otpService.createChallenge(identifier, "REGISTRATION");

    await this.auditService.record({
      actorUserId: user.id,
      actorRole: "PATIENT",
      action: "AUTH_REGISTER",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      userId: user.id,
      status: user.status,
      otpChallengeId: challenge.id,
      otpDeliveredTo: maskIdentifier(identifier),
    };
  }

  /**
   * `POST /auth/verify-otp` — purpose-agnostic per docs/15-API-SPECIFICATION.md
   * ("Verify OTP (registration/reset)"). For `REGISTRATION`, this is the
   * completion step: activates the account and issues a session. For
   * `PASSWORD_RESET`, it only confirms the code is correct (matching the
   * separate "OTP Verification" screen in docs/03-USER-FLOWS.md's reset
   * flow, ahead of the dedicated Reset Password screen) — it deliberately
   * does not consume the challenge, since `resetPassword()` verifies and
   * consumes it again at the point the password actually changes.
   */
  async verifyOtp(
    otpChallengeId: string,
    code: string,
    context: RequestContext,
  ): Promise<
    | { purpose: "REGISTRATION"; tokens: AuthTokens }
    | { purpose: "PASSWORD_RESET" | "LOGIN_VERIFICATION" | "ACCOUNT_ACTIVATION"; verified: true }
  > {
    const challenge = await this.otpService.verify(otpChallengeId, code);

    if (challenge.purpose === "REGISTRATION") {
      const user = await this.prisma.client.user.findFirstOrThrow({
        where: { OR: [{ email: challenge.identifier }, { phone: challenge.identifier }] },
      });

      await this.prisma.client.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
      await this.otpService.consume(challenge.id);

      await this.auditService.record({
        actorUserId: user.id,
        actorRole: "PATIENT",
        action: "AUTH_VERIFY_OTP",
        resourceType: "User",
        resourceId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return { purpose: "REGISTRATION", tokens: await this.issueSession(user.id, context) };
    }

    return { purpose: challenge.purpose, verified: true };
  }

  async resendOtp(otpChallengeId: string) {
    const { challenge, code } = await this.otpService.resendChallenge(otpChallengeId);
    void code; // delivered via OtpService.deliver(), never returned to the client
    return { otpChallengeId: challenge.id, otpDeliveredTo: maskIdentifier(challenge.identifier) };
  }

  async login(input: LoginInput, context: RequestContext): Promise<AuthTokens> {
    // Overrides the client-wide passwordHash omit (packages/database/src/client.ts)
    // — the one read path that legitimately needs it, to verify the password below.
    const user = await this.prisma.client.user.findFirst({
      where: { OR: [{ email: input.identifier }, { phone: input.identifier }] },
      omit: { passwordHash: false },
    });

    // Generic failure for "no such user" — never confirm which field was wrong,
    // and never distinguish "no account" from "wrong password" (docs/16-AUTHENTICATION.md).
    if (!user) {
      throw new DomainException("AUTH_INVALID_CREDENTIALS", "Incorrect email/phone or password.");
    }

    if (user.status === "PENDING_ACTIVATION") {
      throw new DomainException("AUTH_ACCOUNT_PENDING_ACTIVATION", "Please verify your account before logging in.");
    }
    if (user.status === "DISABLED") {
      throw new DomainException("AUTH_ACCOUNT_DISABLED", "This account has been deactivated.");
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new DomainException(
        "AUTH_ACCOUNT_LOCKED",
        `Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`,
      );
    }

    const passwordValid = await verifyPassword(user.passwordHash, input.password);
    if (!passwordValid) {
      await this.registerFailedLogin(user.id, user.failedLoginAttempts);
      throw new DomainException("AUTH_INVALID_CREDENTIALS", "Incorrect email/phone or password.");
    }

    // Checked only after the password is confirmed correct, so a suspended
    // hospital's existence is never leaked to someone who doesn't already
    // know a valid credential for it (docs/16-AUTHENTICATION.md "Login flow").
    if (user.hospitalId) {
      const hospital = await this.prisma.client.hospital.findUnique({ where: { id: user.hospitalId } });
      if (hospital?.status === "SUSPENDED") {
        throw new DomainException("AUTH_HOSPITAL_SUSPENDED", "This hospital's account is currently suspended.");
      }
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.auditService.record({
      hospitalId: user.hospitalId,
      actorUserId: user.id,
      actorRole: "USER",
      action: "AUTH_LOGIN",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.issueSession(user.id, context);
  }

  async refresh(rawRefreshToken: string, context: RequestContext): Promise<{ accessToken: string; refreshToken: string }> {
    const authz = await this.rotateAndResolve(rawRefreshToken, context);
    const accessToken = this.accessTokenService.sign({
      sub: authz.userId,
      hospitalId: authz.hospitalId,
      roles: authz.roles,
      permissions: authz.permissions,
    });
    return { accessToken, refreshToken: authz.rawToken };
  }

  async logout(sessionId: string, userId: string, actorRole: string): Promise<void> {
    await this.refreshTokenService.revokeSession(sessionId);
    await this.auditService.record({
      actorUserId: userId,
      actorRole,
      action: "AUTH_LOGOUT",
      resourceType: "DeviceSession",
      resourceId: sessionId,
    });
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<{ otpChallengeId: string | null; otpDeliveredTo: string }> {
    const user = await this.prisma.client.user.findFirst({
      where: { OR: [{ email: input.identifier }, { phone: input.identifier }] },
    });

    // Identical response whether or not the account exists — no enumeration
    // (docs/16-AUTHENTICATION.md "Forgot / Reset Password").
    if (!user) {
      return { otpChallengeId: null, otpDeliveredTo: maskIdentifier(input.identifier) };
    }

    const { challenge } = await this.otpService.createChallenge(input.identifier, "PASSWORD_RESET");
    return { otpChallengeId: challenge.id, otpDeliveredTo: maskIdentifier(input.identifier) };
  }

  async resetPassword(input: ResetPasswordInput, context: RequestContext): Promise<void> {
    const challenge = await this.otpService.verify(input.otpChallengeId, input.code);
    if (challenge.purpose !== "PASSWORD_RESET") {
      throw new DomainException("AUTH_OTP_INVALID", "Invalid or already-used code.");
    }

    const user = await this.prisma.client.user.findFirstOrThrow({
      where: { OR: [{ email: challenge.identifier }, { phone: challenge.identifier }] },
    });

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.otpService.consume(challenge.id);
    await this.refreshTokenService.revokeAllForUser(user.id);

    await this.auditService.record({
      hospitalId: user.hospitalId,
      actorUserId: user.id,
      actorRole: "USER",
      action: "AUTH_PASSWORD_RESET",
      resourceType: "User",
      resourceId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async getSessions(userId: string) {
    return this.prisma.client.deviceSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: "desc" },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.client.deviceSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) {
      throw new DomainException("NOT_FOUND", "Session not found.");
    }
    await this.refreshTokenService.revokeSession(sessionId);
  }

  async me(userId: string) {
    const [user, authz] = await Promise.all([
      this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } }),
      this.authzResolver.resolve(userId),
    ]);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      hospitalId: authz.hospitalId,
      roles: authz.roles,
      permissions: authz.permissions,
    };
  }

  // -- internals -------------------------------------------------------

  private async issueSession(userId: string, context: RequestContext): Promise<AuthTokens> {
    const authz = await this.authzResolver.resolve(userId);
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });

    const session = await this.prisma.client.deviceSession.create({
      data: {
        userId,
        deviceName: context.deviceName,
        platform: context.platform,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        lastActiveAt: new Date(),
      },
    });

    const isNewDevice = (await this.prisma.client.deviceSession.count({ where: { userId } })) === 1;
    if (isNewDevice) {
      this.logger.log(`New device sign-in for user ${userId} — email alert deferred to Phase 10 (no provider wired yet).`);
    }

    const ttlMs = resolveRefreshTtlMs(authz.roles, this.config.env);
    const refresh = await this.refreshTokenService.issue(userId, session.id, ttlMs);
    const accessToken = this.accessTokenService.sign({
      sub: userId,
      hospitalId: authz.hospitalId,
      roles: authz.roles,
      permissions: authz.permissions,
    });

    return {
      accessToken,
      refreshToken: refresh.rawToken,
      user: { id: user.id, name: user.name, hospitalId: authz.hospitalId, roles: authz.roles, permissions: authz.permissions },
    };
  }

  private async rotateAndResolve(rawRefreshToken: string, context: RequestContext) {
    const provisionalTtl = parseDurationToMs(this.config.env.JWT_REFRESH_TOKEN_TTL_PATIENT);
    const rotated = await this.refreshTokenService.rotate(rawRefreshToken, provisionalTtl, context);
    const authz = await this.authzResolver.resolve(rotated.userId);
    return { ...rotated, ...authz };
  }

  private async registerFailedLogin(userId: string, currentAttempts: number): Promise<void> {
    const nextAttempts = currentAttempts + 1;
    const shouldLock = nextAttempts >= FAILED_LOGIN_LOCKOUT_THRESHOLD;
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + FAILED_LOGIN_LOCKOUT_MINUTES * 60_000) : undefined,
      },
    });
  }

  private async getSystemRole(key: SystemRole) {
    const role = await this.prisma.client.role.findFirst({ where: { hospitalId: null, key } });
    if (!role) {
      throw new Error(`System role ${key} not found — has the catalog seed been run? (pnpm db:seed)`);
    }
    return role;
  }
}

function resolveRefreshTtlMs(roles: SystemRole[], env: { JWT_REFRESH_TOKEN_TTL_PATIENT: string; JWT_REFRESH_TOKEN_TTL_STAFF: string }): number {
  const isPatientOnly = roles.length === 1 && roles[0] === "PATIENT";
  return parseDurationToMs(isPatientOnly ? env.JWT_REFRESH_TOKEN_TTL_PATIENT : env.JWT_REFRESH_TOKEN_TTL_STAFF);
}
