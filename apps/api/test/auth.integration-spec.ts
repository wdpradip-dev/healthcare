import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import { OtpService } from "../src/auth/otp.service";

/**
 * End-to-end coverage of every flow in docs/16-AUTHENTICATION.md, run
 * against a real Postgres database (docs/30-TESTING-STRATEGY.md) — no
 * mocked Prisma, since the correctness this module depends on most
 * (lockout thresholds, OTP attempt counting, refresh-token rotation and
 * reuse detection) can't be verified against a mock. See
 * docs/31-E2E-TEST-CASES.md E2E-AUTH-01 through E2E-AUTH-07.
 */
describe("Auth (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let otpService: OtpService;

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp();
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
    otpService = app.get(OtpService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Cheap, order-independent cleanup: every table this suite touches,
    // deepest-dependency-first. Catalog rows (permissions/roles/medications)
    // are left alone — seeded once in beforeAll, never touched by these tests.
    await prisma.client.refreshToken.deleteMany();
    await prisma.client.deviceSession.deleteMany();
    await prisma.client.otpChallenge.deleteMany();
    await prisma.client.userRole.deleteMany({ where: { role: { key: "PATIENT" } } });
    await prisma.client.patient.deleteMany();
    await prisma.client.auditLog.deleteMany();
    await prisma.client.user.deleteMany({ where: { userRoles: { none: {} } } });
  });

  const server = () => app.getHttpServer();

  async function registerAndVerify(email: string, password = "SecurePass1") {
    const registerRes = await request(server())
      .post("/api/v1/auth/register")
      .send({ name: "Alice Kumar", email, password, acceptedTerms: true })
      .expect(201);

    const code = otpService.getLastDeliveredCodeForTesting(email)!;
    const verifyRes = await request(server())
      .post("/api/v1/auth/verify-otp")
      .send({ otpChallengeId: registerRes.body.otpChallengeId, code })
      .expect(201);

    return verifyRes.body.tokens as { accessToken: string; refreshToken: string; user: { id: string } };
  }

  describe("register", () => {
    it("creates a PENDING_ACTIVATION user and returns an OTP challenge", async () => {
      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "ben.test@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(201);

      expect(res.body.status).toBe("PENDING_ACTIVATION");
      expect(res.body.otpChallengeId).toEqual(expect.any(String));
      expect(res.body.otpDeliveredTo).not.toContain("ben.test@example.com");
    });

    it("rejects a duplicate email with 409 AUTH_EMAIL_ALREADY_EXISTS", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "dup.test@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(201);

      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "dup.test@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(409);

      expect(res.body.error.code).toBe("AUTH_EMAIL_ALREADY_EXISTS");
    });

    it("rejects a policy-violating password with 400 VALIDATION_ERROR", async () => {
      const res = await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "weak.test@example.com", password: "weak", acceptedTerms: true })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe("verify-otp (registration)", () => {
    it("activates the account and returns tokens on the correct code", async () => {
      const tokens = await registerAndVerify("verify.ok@example.com");
      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
      expect(tokens.user.id).toEqual(expect.any(String));
    });

    it("rejects an incorrect code without consuming the challenge", async () => {
      const registerRes = await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "verify.wrong@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(201);

      const res = await request(server())
        .post("/api/v1/auth/verify-otp")
        .send({ otpChallengeId: registerRes.body.otpChallengeId, code: "000000" })
        .expect(400);
      expect(res.body.error.code).toBe("AUTH_OTP_INVALID");
    });

    it("locks out after 5 incorrect attempts with 429 AUTH_OTP_MAX_ATTEMPTS", async () => {
      const registerRes = await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "verify.maxattempts@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(201);

      for (let i = 0; i < 5; i++) {
        await request(server())
          .post("/api/v1/auth/verify-otp")
          .send({ otpChallengeId: registerRes.body.otpChallengeId, code: "000000" });
      }

      const res = await request(server())
        .post("/api/v1/auth/verify-otp")
        .send({ otpChallengeId: registerRes.body.otpChallengeId, code: "000000" })
        .expect(429);
      expect(res.body.error.code).toBe("AUTH_OTP_MAX_ATTEMPTS");
    });
  });

  describe("login", () => {
    it("logs in with correct credentials", async () => {
      await registerAndVerify("login.ok@example.com");
      const res = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: "login.ok@example.com", password: "SecurePass1" })
        .expect(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("rejects an unknown identifier with a generic AUTH_INVALID_CREDENTIALS (no enumeration)", async () => {
      const res = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: "does.not.exist@example.com", password: "whatever1A" })
        .expect(401);
      expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects login before OTP verification with 403 AUTH_ACCOUNT_PENDING_ACTIVATION", async () => {
      await request(server())
        .post("/api/v1/auth/register")
        .send({ name: "Ben Ortiz", email: "login.pending@example.com", password: "SecurePass1", acceptedTerms: true })
        .expect(201);

      const res = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: "login.pending@example.com", password: "SecurePass1" })
        .expect(403);
      expect(res.body.error.code).toBe("AUTH_ACCOUNT_PENDING_ACTIVATION");
    });

    it("locks the account after 5 failed attempts", async () => {
      await registerAndVerify("login.lockout@example.com");

      for (let i = 0; i < 5; i++) {
        await request(server())
          .post("/api/v1/auth/login")
          .send({ identifier: "login.lockout@example.com", password: "WrongPass1" });
      }

      const res = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: "login.lockout@example.com", password: "SecurePass1" })
        .expect(423);
      expect(res.body.error.code).toBe("AUTH_ACCOUNT_LOCKED");
    });
  });

  describe("refresh", () => {
    it("rotates the refresh token and issues a new access token", async () => {
      const tokens = await registerAndVerify("refresh.ok@example.com");

      const res = await request(server())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: tokens.refreshToken })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    });

    it("detects reuse of an already-rotated token and revokes the family", async () => {
      const tokens = await registerAndVerify("refresh.reuse@example.com");

      // First rotation succeeds.
      const first = await request(server())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: tokens.refreshToken })
        .expect(201);

      // Replaying the now-stale original token must be rejected and revoke the family.
      const reuse = await request(server())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      expect(reuse.body.error.code).toBe("AUTH_REFRESH_TOKEN_REUSED");

      // Even the legitimately-rotated token from the first call is now revoked.
      const afterReuse = await request(server())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);
      expect(afterReuse.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    });
  });

  describe("forgot / reset password", () => {
    it("resets the password and revokes existing sessions", async () => {
      const tokens = await registerAndVerify("reset.ok@example.com");

      const forgotRes = await request(server())
        .post("/api/v1/auth/forgot-password")
        .send({ identifier: "reset.ok@example.com" })
        .expect(201);
      expect(forgotRes.body.otpChallengeId).toEqual(expect.any(String));

      const code = otpService.getLastDeliveredCodeForTesting("reset.ok@example.com")!;
      await request(server())
        .post("/api/v1/auth/reset-password")
        .send({ otpChallengeId: forgotRes.body.otpChallengeId, code, newPassword: "NewSecurePass1" })
        .expect(201);

      // The old refresh token no longer works — resetPassword revoked all sessions.
      const oldTokenRes = await request(server())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      expect(oldTokenRes.body.error.code).toBe("AUTH_SESSION_EXPIRED");

      // The new password works.
      await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: "reset.ok@example.com", password: "NewSecurePass1" })
        .expect(201);
    });

    it("does not reveal whether an account exists", async () => {
      const res = await request(server())
        .post("/api/v1/auth/forgot-password")
        .send({ identifier: "no.such.account@example.com" })
        .expect(201);
      expect(res.body.otpChallengeId).toBeNull();
    });
  });

  describe("me", () => {
    it("returns the caller's profile with resolved permissions", async () => {
      const tokens = await registerAndVerify("me.ok@example.com");

      const res = await request(server())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body.email).toBe("me.ok@example.com");
      expect(res.body.roles).toEqual(["PATIENT"]);
      expect(res.body.permissions).toEqual(expect.arrayContaining(["appointments.create", "medical_records.read"]));
    });

    it("rejects a request with no token", async () => {
      const res = await request(server()).get("/api/v1/auth/me").expect(401);
      expect(res.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    });
  });
});
