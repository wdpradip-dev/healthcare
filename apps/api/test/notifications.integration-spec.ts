import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { EmailProvider, PushProvider } from "@hospital/shared";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createBranch,
  createDepartment,
  createDoctorProfile,
  createDoctorScheduleBlock,
  createHospital,
  createHospitalSettings,
  createPatientProfile,
  createStaffUser,
  signAccessTokenForUser,
} from "./fixtures";

/**
 * Phase 10 (docs/41-TASKS.md T-1001–T-1007): the notification fan-out
 * (`IN_APP` inbox row always created, `PUSH`/`EMAIL` rows only when
 * eligible), preference gating vs. transactional/security events that
 * ignore it, delivery outcome recording, templates, push-token
 * registration, and `notifications.manage`'s delivery-health/template
 * routes. Email/push are injected stubs — nothing here reaches a real
 * provider.
 */
describe("Notifications (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email: EmailProvider & { send: jest.Mock } = { isConfigured: true, send: jest.fn() };
  const push: PushProvider & { send: jest.Mock } = { isConfigured: true, send: jest.fn() };

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp({ emailProvider: email, pushProvider: push });
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    email.send.mockReset().mockResolvedValue(true);
    push.send.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await prisma.client.notificationTemplate.deleteMany();
    await prisma.client.notification.deleteMany();
    await prisma.client.appointmentHistory.deleteMany();
    await prisma.client.appointment.deleteMany();
    await prisma.client.doctorSchedule.deleteMany();
    await prisma.client.doctorDepartment.deleteMany();
    await prisma.client.doctor.deleteMany();
    await prisma.client.patient.deleteMany();
    await prisma.client.staff.deleteMany();
    await prisma.client.department.deleteMany();
    await prisma.client.branch.deleteMany();
    await prisma.client.hospitalSettings.deleteMany();
    await prisma.client.auditLog.deleteMany();
    await prisma.client.refreshToken.deleteMany();
    await prisma.client.deviceSession.deleteMany();
    await prisma.client.userRole.deleteMany();
    await prisma.client.user.deleteMany();
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  function testMonday(offsetWeeks = 1): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7 * offsetWeeks);
    const diff = (1 - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  async function setup() {
    const hospitalA = await createHospital(prisma);
    const branchA = await createBranch(prisma, hospitalA.id);
    const deptA = await createDepartment(prisma, hospitalA.id, branchA.id, { name: "Cardiology" });
    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    await createHospitalSettings(prisma, hospitalA.id, adminA.id);

    const { user: doctorUser, doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    await prisma.client.doctorDepartment.create({ data: { doctorId: doctor.id, departmentId: deptA.id } });
    await createDoctorScheduleBlock(prisma, {
      hospitalId: hospitalA.id,
      doctorId: doctor.id,
      departmentId: deptA.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 20,
      maxAppointments: null,
    });

    const { user: patientUser, patient } = await createPatientProfile(prisma);

    return {
      hospitalA,
      deptA,
      doctor,
      patient,
      patientUser,
      adminA,
      adminToken: await signAccessTokenForUser(app, adminA.id),
      doctorToken: await signAccessTokenForUser(app, doctorUser.id),
      patientToken: await signAccessTokenForUser(app, patientUser.id),
    };
  }

  const book = (token: string, doctorId: string, departmentId: string, startTime: string) =>
    request(server()).post("/api/v1/appointments").set(bearer(token)).send({ doctorId, departmentId, startTime, reason: "Checkup" });

  describe("fan-out and the inbox", () => {
    it("always creates one IN_APP row, plus PUSH/EMAIL rows only for eligible channels, on booking", async () => {
      const ctx = await setup();
      const res = await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      expect(res.status).toBe(201);

      const rows = await prisma.client.notification.findMany({ where: { userId: ctx.patientUser.id, type: "APPOINTMENT_BOOKED" } });
      expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "IN_APP", "PUSH"]);
      const inApp = rows.find((r) => r.channel === "IN_APP")!;
      expect(inApp.deliveryStatus).toBe("DELIVERED");
      expect(inApp.readAt).toBeNull();

      // EMAIL: the stub is configured and the patient has an email -> SENT.
      const emailRow = rows.find((r) => r.channel === "EMAIL")!;
      await new Promise((r) => setTimeout(r, 50));
      const emailAfter = await prisma.client.notification.findUniqueOrThrow({ where: { id: emailRow.id } });
      expect(emailAfter.deliveryStatus).toBe("SENT");
      expect(email.send).toHaveBeenCalledTimes(1);

      // PUSH: no DeviceSession/pushToken exists for a fixture-signed token -> FAILED, provider never called.
      const pushRow = rows.find((r) => r.channel === "PUSH")!;
      const pushAfter = await prisma.client.notification.findUniqueOrThrow({ where: { id: pushRow.id } });
      expect(pushAfter.deliveryStatus).toBe("FAILED");
      expect(pushAfter.lastError).toMatch(/push token/i);
      expect(push.send).not.toHaveBeenCalled();
    });

    it("GET /notifications only ever returns IN_APP rows, newest first, and is SELF-scoped", async () => {
      const ctx = await setup();
      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      await new Promise((r) => setTimeout(r, 20));

      const list = await request(server()).get("/api/v1/notifications").set(bearer(ctx.patientToken));
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].channel).toBe("IN_APP");
      expect(list.body[0].type).toBe("APPOINTMENT_BOOKED");

      const doctorList = await request(server()).get("/api/v1/notifications").set(bearer(ctx.doctorToken));
      expect(doctorList.body).toHaveLength(0);
    });

    it("marks one read, rejects marking another user's notification, and marks all read", async () => {
      const ctx = await setup();
      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      const [row] = await request(server()).get("/api/v1/notifications").set(bearer(ctx.patientToken)).then((r) => r.body);

      expect((await request(server()).patch(`/api/v1/notifications/${row.id}/read`).set(bearer(ctx.doctorToken))).status).toBe(404);

      const marked = await request(server()).patch(`/api/v1/notifications/${row.id}/read`).set(bearer(ctx.patientToken));
      expect(marked.status).toBe(200);
      expect(marked.body.readAt).toBeTruthy();

      const unreadFilter = await request(server()).get("/api/v1/notifications?read=false").set(bearer(ctx.patientToken));
      expect(unreadFilter.body).toHaveLength(0);

      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:20:00.000Z`);
      const markAll = await request(server()).patch("/api/v1/notifications/read-all").set(bearer(ctx.patientToken));
      expect(markAll.body.updated).toBe(1);
      expect((await request(server()).get("/api/v1/notifications?read=false").set(bearer(ctx.patientToken))).body).toHaveLength(0);
    });
  });

  describe("preferences", () => {
    it("defaults to everything enabled, and a category/channel toggle suppresses only that channel — IN_APP is unaffected", async () => {
      const ctx = await setup();
      const initial = await request(server()).get("/api/v1/notifications/preferences").set(bearer(ctx.patientToken));
      expect(initial.body).toEqual({});

      const updated = await request(server())
        .patch("/api/v1/notifications/preferences")
        .set(bearer(ctx.patientToken))
        .send({ push: false, categories: { appointments: false } });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ push: false, categories: { appointments: false } });

      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      const rows = await prisma.client.notification.findMany({ where: { userId: ctx.patientUser.id, type: "APPOINTMENT_BOOKED" } });
      expect(rows.map((r) => r.channel).sort()).toEqual(["IN_APP"]);
    });

    it("a partial update merges rather than replaces", async () => {
      const ctx = await setup();
      await request(server()).patch("/api/v1/notifications/preferences").set(bearer(ctx.patientToken)).send({ push: false });
      const second = await request(server()).patch("/api/v1/notifications/preferences").set(bearer(ctx.patientToken)).send({ email: false });
      expect(second.body).toMatchObject({ push: false, email: false });
    });

    it("never gates a transactional/security event, even with every preference off", async () => {
      const ctx = await setup();
      await request(server())
        .patch("/api/v1/notifications/preferences")
        .set(bearer(ctx.patientToken))
        .send({ push: false, email: false, categories: { appointments: false, consultations: false, prescriptions: false, reports: false } });

      const login = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: ctx.patientUser.email, password: "Password1" });
      expect(login.status).toBe(201);

      await new Promise((r) => setTimeout(r, 20));
      const rows = await prisma.client.notification.findMany({ where: { userId: ctx.patientUser.id, type: "NEW_DEVICE_LOGIN" } });
      expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    });
  });

  describe("push token registration and PUSH delivery", () => {
    it("registers the most recently active session's token, then a later PUSH-eligible event is delivered through the injected provider", async () => {
      const ctx = await setup();
      await request(server()).post("/api/v1/auth/login").send({ identifier: ctx.patientUser.email, password: "Password1" });

      const register = await request(server()).patch("/api/v1/notifications/push-token").set(bearer(ctx.patientToken)).send({ pushToken: "ExponentPushToken[test]" });
      expect(register.status).toBe(200);

      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      await new Promise((r) => setTimeout(r, 50));

      expect(push.send).toHaveBeenCalledWith(expect.objectContaining({ token: "ExponentPushToken[test]" }));
      const pushRow = await prisma.client.notification.findFirstOrThrow({ where: { userId: ctx.patientUser.id, type: "APPOINTMENT_BOOKED", channel: "PUSH" } });
      expect(pushRow.deliveryStatus).toBe("SENT");
    });

    it("404s registering a push token with no active session", async () => {
      const ctx = await setup();
      const res = await request(server()).patch("/api/v1/notifications/push-token").set(bearer(ctx.patientToken)).send({ pushToken: "x" });
      expect(res.status).toBe(404);
    });
  });

  describe("templates", () => {
    it("lists the built-in defaults for every (event, channel), and an override is what notify() actually uses", async () => {
      const ctx = await setup();
      const list = await request(server()).get("/api/v1/notifications/templates").set(bearer(ctx.adminToken));
      expect(list.status).toBe(200);
      const booked = list.body.find((t: { key: string; channel: string }) => t.key === "APPOINTMENT_BOOKED" && t.channel === "IN_APP");
      expect(booked.isDefault).toBe(true);
      expect(booked.body).toContain("{{doctorName}}");

      const put = await request(server())
        .put("/api/v1/notifications/templates/APPOINTMENT_BOOKED")
        .set(bearer(ctx.adminToken))
        .send({ channel: "IN_APP", body: "Custom: see you {{appointmentTime}}." });
      expect(put.status).toBe(200);
      expect(put.body.isDefault).toBe(false);

      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      const row = await prisma.client.notification.findFirstOrThrow({ where: { userId: ctx.patientUser.id, channel: "IN_APP", type: "APPOINTMENT_BOOKED" } });
      expect(row.body).toContain("Custom: see you");
      expect(row.body).not.toContain("{{");
    });

    it("rejects an unknown event key", async () => {
      const ctx = await setup();
      const res = await request(server()).put("/api/v1/notifications/templates/NOT_A_REAL_EVENT").set(bearer(ctx.adminToken)).send({ channel: "EMAIL", body: "x" });
      expect(res.status).toBe(400);
    });

    it("is notifications.manage only — a Doctor and a self-service Patient are both refused", async () => {
      const ctx = await setup();
      expect((await request(server()).get("/api/v1/notifications/templates").set(bearer(ctx.doctorToken))).status).toBe(403);
      expect((await request(server()).get("/api/v1/notifications/templates").set(bearer(ctx.patientToken))).status).toBe(403);
      expect((await request(server()).get("/api/v1/notifications/health").set(bearer(ctx.doctorToken))).status).toBe(403);
    });
  });

  describe("delivery health", () => {
    it("aggregates by event and channel, separating sent from failed", async () => {
      const ctx = await setup();
      await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      await new Promise((r) => setTimeout(r, 50));

      const health = await request(server()).get("/api/v1/notifications/health").set(bearer(ctx.adminToken));
      expect(health.status).toBe(200);
      const emailRow = health.body.find((r: { event: string; channel: string }) => r.event === "APPOINTMENT_BOOKED" && r.channel === "EMAIL");
      const pushRow = health.body.find((r: { event: string; channel: string }) => r.event === "APPOINTMENT_BOOKED" && r.channel === "PUSH");
      expect(emailRow).toMatchObject({ total: 1, sent: 1, failed: 0 });
      expect(pushRow).toMatchObject({ total: 1, sent: 0, failed: 1 });
    });

    it("carries on (FAILED, not a thrown error) when the provider itself throws", async () => {
      const ctx = await setup();
      email.send.mockRejectedValueOnce(new Error("network down"));
      const res = await book(ctx.patientToken, ctx.doctor.id, ctx.deptA.id, `${testMonday()}T09:00:00.000Z`);
      expect(res.status).toBe(201);

      await new Promise((r) => setTimeout(r, 50));
      const emailRow = await prisma.client.notification.findFirstOrThrow({ where: { userId: ctx.patientUser.id, channel: "EMAIL" } });
      expect(emailRow.deliveryStatus).toBe("FAILED");
      expect(emailRow.lastError).toContain("network down");
    });
  });
});
