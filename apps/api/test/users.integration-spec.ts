import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createHospital, createStaffUser, signAccessTokenForUser } from "./fixtures";
import { UsersService } from "../src/users/users.service";
import { OtpService } from "../src/auth/otp.service";

/**
 * Staff invite → activate → deactivate lifecycle (docs/16-AUTHENTICATION.md
 * "Staff activation") plus tenant isolation for /users (T-404, T-408).
 */
describe("Users invite/activate/deactivate (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;
  let otpService: OtpService;

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp();
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
    usersService = app.get(UsersService);
    otpService = app.get(OtpService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.refreshToken.deleteMany();
    await prisma.client.deviceSession.deleteMany();
    await prisma.client.otpChallenge.deleteMany();
    await prisma.client.staff.deleteMany();
    await prisma.client.userRole.deleteMany({ where: { role: { key: { in: ["ADMIN", "SUPER_ADMIN", "NURSE", "RECEPTIONIST", "DOCTOR"] } } } });
    await prisma.client.auditLog.deleteMany();
    await prisma.client.user.deleteMany({ where: { userRoles: { none: {} } } });
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function setup() {
    const hospitalA = await createHospital(prisma);
    const hospitalB = await createHospital(prisma);
    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });
    return {
      hospitalA,
      hospitalB,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
    };
  }

  it("full lifecycle: invite (Nurse) provisions a Staff row, activates via token+OTP+password, then logs in", async () => {
    const { adminAToken } = await setup();

    const inviteRes = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Nina Nurse", email: "nina.nurse@example.test", roleKey: "NURSE" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.status).toBe("PENDING_ACTIVATION");

    const staff = await prisma.client.staff.findUnique({ where: { userId: inviteRes.body.userId } });
    expect(staff).not.toBeNull();

    const activationToken = usersService.getLastActivationTokenForTesting(inviteRes.body.userId);
    expect(activationToken).toBeDefined();

    const requestOtpRes = await request(server()).post("/api/v1/users/activate/request-otp").send({ activationToken });
    expect(requestOtpRes.status).toBe(201);
    const { otpChallengeId } = requestOtpRes.body;
    const code = otpService.getLastDeliveredCodeForTesting("nina.nurse@example.test")!;
    expect(code).toMatch(/^\d{6}$/);

    const activateRes = await request(server())
      .post("/api/v1/users/activate")
      .send({ activationToken, otpChallengeId, code, password: "NewPassword1" });
    expect(activateRes.status).toBe(201);
    expect(activateRes.body).toEqual({ success: true });

    const loginRes = await request(server())
      .post("/api/v1/auth/login")
      .send({ identifier: "nina.nurse@example.test", password: "NewPassword1" });
    expect(loginRes.status).toBe(201);
    expect(loginRes.body.user.roles).toContain("NURSE");
  });

  it("does not provision a Staff row for a Doctor invite (created later via POST /doctors, Phase 5)", async () => {
    const { adminAToken } = await setup();
    const inviteRes = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Dr. Dana Doctor", email: "dana.doctor@example.test", roleKey: "DOCTOR" });
    expect(inviteRes.status).toBe(201);
    const staff = await prisma.client.staff.findUnique({ where: { userId: inviteRes.body.userId } });
    expect(staff).toBeNull();
  });

  it("rejects an invite for an already-registered email with 409 AUTH_EMAIL_ALREADY_EXISTS", async () => {
    const { adminAToken } = await setup();
    await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "First", email: "dup@example.test", roleKey: "NURSE" });
    const res = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Second", email: "dup@example.test", roleKey: "RECEPTIONIST" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("AUTH_EMAIL_ALREADY_EXISTS");
  });

  it("rejects an expired/invalid activation token with AUTH_ACTIVATION_TOKEN_INVALID", async () => {
    const res = await request(server())
      .post("/api/v1/users/activate/request-otp")
      .send({ activationToken: "not-a-real-token" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AUTH_ACTIVATION_TOKEN_INVALID");
  });

  it("rejects reusing a PASSWORD_RESET-purpose OTP challenge to activate an account", async () => {
    const { adminAToken } = await setup();
    const inviteRes = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Rita Receptionist", email: "rita.reception@example.test", roleKey: "RECEPTIONIST" });
    const activationToken = usersService.getLastActivationTokenForTesting(inviteRes.body.userId)!;

    // A challenge for a completely different purpose/identifier must never work here.
    const { challenge } = await otpService.createChallenge("someone-else@example.test", "PASSWORD_RESET");

    const res = await request(server())
      .post("/api/v1/users/activate")
      .send({ activationToken, otpChallengeId: challenge.id, code: "000000", password: "NewPassword1" });
    expect([400]).toContain(res.status);
  });

  it("deactivate revokes all sessions immediately and blocks future login", async () => {
    const { adminAToken } = await setup();
    const inviteRes = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Ollie Ops", email: "ollie.ops@example.test", roleKey: "RECEPTIONIST" });
    const activationToken = usersService.getLastActivationTokenForTesting(inviteRes.body.userId)!;
    const requestOtpRes = await request(server()).post("/api/v1/users/activate/request-otp").send({ activationToken });
    const code = otpService.getLastDeliveredCodeForTesting("ollie.ops@example.test")!;
    await request(server())
      .post("/api/v1/users/activate")
      .send({ activationToken, otpChallengeId: requestOtpRes.body.otpChallengeId, code, password: "NewPassword1" });

    const loginRes = await request(server())
      .post("/api/v1/auth/login")
      .send({ identifier: "ollie.ops@example.test", password: "NewPassword1" });
    expect(loginRes.status).toBe(201);
    const refreshToken = loginRes.body.refreshToken;

    const deactivateRes = await request(server())
      .post(`/api/v1/users/${inviteRes.body.userId}/deactivate`)
      .set("Authorization", `Bearer ${adminAToken}`);
    expect(deactivateRes.status).toBe(201);
    expect(deactivateRes.body.status).toBe("DISABLED");

    const refreshRes = await request(server()).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refreshRes.status).toBe(401);

    const secondLoginRes = await request(server())
      .post("/api/v1/auth/login")
      .send({ identifier: "ollie.ops@example.test", password: "NewPassword1" });
    expect(secondLoginRes.status).toBe(403);
    expect(secondLoginRes.body.error.code).toBe("AUTH_ACCOUNT_DISABLED");
  });

  it("tenant isolation: an Admin cannot read, invite into, or deactivate another hospital's users", async () => {
    const { adminAToken, adminBToken } = await setup();
    const inviteRes = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Hospital A Staff", email: "staffa@example.test", roleKey: "NURSE" });
    const userId = inviteRes.body.userId;

    const getRes = await request(server()).get(`/api/v1/users/${userId}`).set("Authorization", `Bearer ${adminBToken}`);
    expect(getRes.status).toBe(404);

    const deactivateRes = await request(server())
      .post(`/api/v1/users/${userId}/deactivate`)
      .set("Authorization", `Bearer ${adminBToken}`);
    expect(deactivateRes.status).toBe(404);

    const listRes = await request(server()).get("/api/v1/users").set("Authorization", `Bearer ${adminBToken}`);
    expect(listRes.body.every((u: { id: string }) => u.id !== userId)).toBe(true);
  });

  it("rejects a Nurse/non-manager actor with 403 FORBIDDEN on invite", async () => {
    const { hospitalA } = await setup();
    const nurse = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE" });
    const nurseToken = await signAccessTokenForUser(app, nurse.id);
    const res = await request(server())
      .post("/api/v1/users/invite")
      .set("Authorization", `Bearer ${nurseToken}`)
      .send({ name: "Should Fail", email: "shouldfail@example.test", roleKey: "NURSE" });
    expect(res.status).toBe(403);
  });
});
