import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createBranch,
  createDepartment,
  createDoctorProfile,
  createHospital,
  createHospitalSettings,
  createPatientProfile,
  createStaffMember,
  createStaffUser,
  signAccessTokenForUser,
} from "./fixtures";

/**
 * Phase 6 (docs/41-TASKS.md T-601–T-605): DoctorSchedule template CRUD +
 * overlap validation, ScheduleException CRUD, and the availability
 * computation endpoint — scope enforcement per docs/02-PERSONAS-AND-ROLES.md's
 * matrix and tenant isolation (T-408's discipline extended again). The pure
 * slot-generation math itself (buffer/exceptions/timezone/DST) is covered
 * separately and far more cheaply in `src/schedules/availability.util.spec.ts`
 * — this file only proves the DB wiring and access control around it.
 */
describe("Schedules (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp();
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.scheduleException.deleteMany();
    await prisma.client.doctorSchedule.deleteMany();
    await prisma.client.doctorDepartment.deleteMany();
    await prisma.client.doctor.deleteMany();
    await prisma.client.patient.deleteMany();
    await prisma.client.staff.deleteMany();
    await prisma.client.department.deleteMany();
    await prisma.client.branch.deleteMany();
    await prisma.client.hospitalSettings.deleteMany();
    await prisma.client.auditLog.deleteMany();
    await prisma.client.userRole.deleteMany();
    await prisma.client.user.deleteMany();
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function setup() {
    const hospitalA = await createHospital(prisma);
    const hospitalB = await createHospital(prisma);
    const branchA = await createBranch(prisma, hospitalA.id);
    const otherBranchA = await createBranch(prisma, hospitalA.id);
    const branchB = await createBranch(prisma, hospitalB.id);
    const deptA = await createDepartment(prisma, hospitalA.id, branchA.id, { name: "Cardiology" });
    const deptB = await createDepartment(prisma, hospitalB.id, branchB.id, { name: "Cardiology" });

    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    await createHospitalSettings(prisma, hospitalA.id, adminA.id);
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });
    await createHospitalSettings(prisma, hospitalB.id, adminB.id);

    const { user: doctorUser, doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    await prisma.client.doctorDepartment.create({ data: { doctorId: doctor.id, departmentId: deptA.id } });

    return {
      hospitalA,
      hospitalB,
      branchA,
      otherBranchA,
      branchB,
      deptA,
      deptB,
      doctor,
      doctorUser,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
      doctorToken: await signAccessTokenForUser(app, doctorUser.id),
    };
  }

  const validDays = (departmentId: string) => [
    { departmentId, dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 20 },
  ];

  describe("PUT /schedules/:doctorId (weekly template)", () => {
    it("lets a Doctor set their own template (SELF scope)", async () => {
      const { deptA, doctor, doctorToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ days: validDays(deptA.id) });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].dayOfWeek).toBe(1);
    });

    it("lets an Admin set a template for any doctor in their own hospital", async () => {
      const { deptA, doctor, adminAToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ days: validDays(deptA.id) });
      expect(res.status).toBe(200);
    });

    it("rejects a Doctor setting another doctor's template", async () => {
      const { hospitalA, deptA, doctor, adminAToken } = await setup();
      const { user: otherDoctorUser } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      const otherDoctorToken = await signAccessTokenForUser(app, otherDoctorUser.id);

      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${otherDoctorToken}`)
        .send({ days: validDays(deptA.id) });
      expect(res.status).toBe(404);
      void adminAToken;
    });

    it("tenant isolation: an Admin cannot set a template for another hospital's doctor", async () => {
      const { deptA, doctor, adminBToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ days: validDays(deptA.id) });
      expect(res.status).toBe(404);
    });

    it("rejects overlapping blocks on the same day", async () => {
      const { deptA, doctor, adminAToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          days: [
            { departmentId: deptA.id, dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 20 },
            { departmentId: deptA.id, dayOfWeek: 1, startTime: "11:00", endTime: "14:00", slotDurationMinutes: 20 },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a departmentId the doctor isn't assigned to", async () => {
      const { deptB, doctor, adminAToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ days: validDays(deptB.id) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("accepts non-overlapping morning + afternoon blocks on the same day", async () => {
      const { deptA, doctor, adminAToken } = await setup();
      const res = await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          days: [
            { departmentId: deptA.id, dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMinutes: 20 },
            { departmentId: deptA.id, dayOfWeek: 1, startTime: "13:00", endTime: "17:00", slotDurationMinutes: 20 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /schedules/:doctorId (read template)", () => {
    it("scopes a Receptionist's read access to their own branch", async () => {
      const { hospitalA, branchA, otherBranchA, deptA, doctor, adminAToken } = await setup();
      await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ days: validDays(deptA.id) });

      const { staff: sameBranchStaff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "RECEPTIONIST" });
      const { staff: otherBranchStaff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: otherBranchA.id, roleKey: "RECEPTIONIST" });
      const sameBranchToken = await signAccessTokenForUser(app, sameBranchStaff.userId);
      const otherBranchToken = await signAccessTokenForUser(app, otherBranchStaff.userId);

      const okRes = await request(server()).get(`/api/v1/schedules/${doctor.id}`).set("Authorization", `Bearer ${sameBranchToken}`);
      expect(okRes.status).toBe(200);

      const blockedRes = await request(server()).get(`/api/v1/schedules/${doctor.id}`).set("Authorization", `Bearer ${otherBranchToken}`);
      expect(blockedRes.status).toBe(404);
    });

    it("rejects a Patient actor entirely (schedules.read is PLATFORM but availability-only)", async () => {
      const { doctor } = await setup();
      const { user: patientUser } = await createPatientProfile(prisma);
      const patientToken = await signAccessTokenForUser(app, patientUser.id);

      const res = await request(server()).get(`/api/v1/schedules/${doctor.id}`).set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("/schedules/:doctorId/exceptions", () => {
    it("creates, lists, and deletes an exception as the doctor's own Admin", async () => {
      const { doctor, adminAToken } = await setup();
      const createRes = await request(server())
        .post(`/api/v1/schedules/${doctor.id}/exceptions`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25", reason: "Christmas" });
      expect(createRes.status).toBe(201);
      expect(createRes.body.type).toBe("HOLIDAY");

      const listRes = await request(server()).get(`/api/v1/schedules/${doctor.id}/exceptions`).set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);

      const deleteRes = await request(server())
        .delete(`/api/v1/schedules/${doctor.id}/exceptions/${createRes.body.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(deleteRes.status).toBe(200);

      const listAfterRes = await request(server()).get(`/api/v1/schedules/${doctor.id}/exceptions`).set("Authorization", `Bearer ${adminAToken}`);
      expect(listAfterRes.body).toHaveLength(0);
    });

    it("rejects a Nurse actor (no schedules.write) from creating an exception", async () => {
      const { hospitalA, branchA, doctor } = await setup();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "NURSE" });
      const nurseToken = await signAccessTokenForUser(app, staff.userId);
      const res = await request(server())
        .post(`/api/v1/schedules/${doctor.id}/exceptions`)
        .set("Authorization", `Bearer ${nurseToken}`)
        .send({ type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25" });
      expect(res.status).toBe(403);
    });

    it("tenant isolation: an Admin cannot create or list exceptions for another hospital's doctor", async () => {
      const { doctor, adminBToken } = await setup();
      const createRes = await request(server())
        .post(`/api/v1/schedules/${doctor.id}/exceptions`)
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25" });
      expect(createRes.status).toBe(404);

      const listRes = await request(server()).get(`/api/v1/schedules/${doctor.id}/exceptions`).set("Authorization", `Bearer ${adminBToken}`);
      expect(listRes.status).toBe(404);
    });

    it("rejects deleting an exception that belongs to a different doctor", async () => {
      const { hospitalA, deptA, doctor, adminAToken } = await setup();
      const createRes = await request(server())
        .post(`/api/v1/schedules/${doctor.id}/exceptions`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ type: "HOLIDAY", startDate: "2026-12-25", endDate: "2026-12-25" });

      const { user: otherDoctorUser, doctor: otherDoctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      await prisma.client.doctorDepartment.create({ data: { doctorId: otherDoctor.id, departmentId: deptA.id } });
      void otherDoctorUser;

      const res = await request(server())
        .delete(`/api/v1/schedules/${otherDoctor.id}/exceptions/${createRes.body.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /schedules/availability", () => {
    it("computes slots for a doctor's published template, respecting the hospital's timezone", async () => {
      const { hospitalA, deptA, doctor, adminAToken } = await setup();
      await prisma.client.hospitalSettings.update({ where: { hospitalId: hospitalA.id }, data: { timezone: "America/Chicago" } });
      await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ days: validDays(deptA.id) });

      // 2027-01-04 is a Monday, safely after the template's effectiveFrom
      // (set to "today" by replaceWeeklyTemplate — see doctor-schedule.service.ts).
      const res = await request(server())
        .get(`/api/v1/schedules/availability`)
        .query({ doctorId: doctor.id, from: "2027-01-04", to: "2027-01-04" })
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.days[0].hasSlots).toBe(true);
      // January is CST (UTC-6) in America/Chicago — DST doesn't start until March.
      expect(res.body.days[0].slots[0].startTime).toBe("2027-01-04T09:00:00.000-06:00");
    });

    it("is reachable by a Patient actor with no hospital context at all (PLATFORM discovery)", async () => {
      const { deptA, doctor, adminAToken } = await setup();
      await request(server())
        .put(`/api/v1/schedules/${doctor.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ days: validDays(deptA.id) });

      const { user: patientUser } = await createPatientProfile(prisma);
      const patientToken = await signAccessTokenForUser(app, patientUser.id);

      const res = await request(server())
        .get(`/api/v1/schedules/availability`)
        .query({ doctorId: doctor.id, from: "2027-01-04", to: "2027-01-04" })
        .set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.days[0].hasSlots).toBe(true);
    });
  });
});
