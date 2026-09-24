import type { INestApplication } from "@nestjs/common";
import request from "supertest";
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
  createStaffMember,
  createStaffUser,
  signAccessTokenForUser,
} from "./fixtures";

/**
 * Phase 7 (docs/41-TASKS.md T-701–T-706): booking/reschedule/cancel/check-in/
 * no-show, the role×sub-action split behind `appointments.update`, and the
 * conflict-safe booking transaction. `testMonday()` picks a real future
 * Monday relative to "now" (never a hardcoded date) so the suite doesn't rot
 * as the environment's clock advances — see the Phase 6 lesson recorded in
 * docs/42-PROJECT-STATE.md about a fixed past-relative date silently failing.
 */
describe("Appointments (integration)", () => {
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
    await prisma.client.userRole.deleteMany();
    await prisma.client.user.deleteMany();
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();

  /** A Monday at least 7 days out (clears any lead-time policy) and well
   * within 60 days (clears the max-advance-booking policy). */
  function testMonday(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    const diff = (1 - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  const SLOT_START = `${testMonday()}T09:00:00.000Z`;
  const SLOT_START_2 = `${testMonday()}T09:20:00.000Z`;

  async function setup(scheduleOverrides: { maxAppointments?: number } = {}) {
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
      maxAppointments: scheduleOverrides.maxAppointments ?? null,
    });

    const { user: patientUser, patient } = await createPatientProfile(prisma);
    const { user: otherPatientUser, patient: otherPatient } = await createPatientProfile(prisma);
    const { user: receptionistUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "RECEPTIONIST" });
    const { user: nurseUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "NURSE" });

    return {
      hospitalA,
      branchA,
      deptA,
      doctor,
      doctorUser,
      patient,
      patientUser,
      otherPatient,
      otherPatientUser,
      adminA,
      adminToken: await signAccessTokenForUser(app, adminA.id),
      doctorToken: await signAccessTokenForUser(app, doctorUser.id),
      patientToken: await signAccessTokenForUser(app, patientUser.id),
      otherPatientToken: await signAccessTokenForUser(app, otherPatientUser.id),
      receptionistToken: await signAccessTokenForUser(app, receptionistUser.id),
      nurseToken: await signAccessTokenForUser(app, nurseUser.id),
    };
  }

  describe("POST /appointments (booking)", () => {
    it("lets a Patient book their own appointment (self-service, auto-confirmed)", async () => {
      const { deptA, doctor, patientToken, patient } = await setup();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START, reason: "Annual checkup" });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("CONFIRMED");
      expect(res.body.patientId).toBe(patient.id);
      expect(res.body.doctorId).toBe(doctor.id);
      expect(res.body.endTime).toBeTruthy();
    });

    it("lets a Receptionist book on a patient's behalf", async () => {
      const { deptA, doctor, receptionistToken, patient } = await setup();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${receptionistToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, patientId: patient.id, startTime: SLOT_START });

      expect(res.status).toBe(201);
      expect(res.body.patientId).toBe(patient.id);
    });

    it("blocks an unassigned Receptionist (null Staff.branchId) from booking against any branch — fails closed, not open", async () => {
      const { hospitalA, deptA, doctor, patient } = await setup();
      const { user: unassignedReceptionist } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: null, roleKey: "RECEPTIONIST" });
      const unassignedToken = await signAccessTokenForUser(app, unassignedReceptionist.id);

      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${unassignedToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, patientId: patient.id, startTime: SLOT_START });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a Receptionist booking without a patientId", async () => {
      const { deptA, doctor, receptionistToken } = await setup();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${receptionistToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a Doctor attempting to book (no appointments.create permission)", async () => {
      const { deptA, doctor, doctorToken } = await setup();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      expect(res.status).toBe(403);
    });

    it("rejects a slot that isn't on the doctor's published schedule", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: `${testMonday()}T23:00:00.000Z` });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });

    it("rejects booking a department the doctor isn't assigned to", async () => {
      const { hospitalA, branchA, doctor, patientToken } = await setup();
      const otherDept = await createDepartment(prisma, hospitalA.id, branchA.id, { name: "Pediatrics" });
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: otherDept.id, startTime: SLOT_START });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a booking inside the minimum lead time", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const soon = new Date(Date.now() + 5 * 60_000).toISOString();
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: soon });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });

    it("enforces the doctor's maxAppointments/day cap", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup({ maxAppointments: 1 });
      const first = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      expect(first.status).toBe(201);

      const second = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${otherPatientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START_2 });

      expect(second.status).toBe(422);
      expect(second.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });

    /**
     * T-706 / E2E-APPT-02 — the correctness-critical concurrency case:
     * two patients racing for the exact same (doctorId, startTime) must
     * yield exactly one success and one 409, and exactly one row in the
     * database. This is what proves the partial unique index (not the
     * application-level availability check) is the actual source of truth,
     * per docs/19-APPOINTMENT-ENGINE.md.
     */
    it("resolves a concurrent double-booking race to exactly one winner", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();

      const [resA, resB] = await Promise.all([
        request(server())
          .post("/api/v1/appointments")
          .set("Authorization", `Bearer ${patientToken}`)
          .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START }),
        request(server())
          .post("/api/v1/appointments")
          .set("Authorization", `Bearer ${otherPatientToken}`)
          .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);
      const loser = resA.status === 409 ? resA : resB;
      expect(loser.body.error.code).toBe("APPOINTMENT_CONFLICT");

      const rows = await prisma.client.appointment.findMany({
        where: { doctorId: doctor.id, startTime: new Date(SLOT_START) },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("PATCH /appointments/:id/reschedule", () => {
    async function book(patientToken: string, deptA: string, doctorId: string) {
      const res = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId, departmentId: deptA, startTime: SLOT_START });
      return res.body as { id: string };
    }

    it("lets a Patient reschedule their own appointment", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const appt = await book(patientToken, deptA.id, doctor.id);

      const res = await request(server())
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ newStartTime: SLOT_START_2 });

      expect(res.status).toBe(200);
      expect(res.body.startTime).toBe(new Date(SLOT_START_2).toISOString());
      expect(res.body.rescheduleCount).toBe(1);
    });

    it("blocks a Doctor from rescheduling (appointments.update sub-action split)", async () => {
      const { deptA, doctor, patientToken, doctorToken } = await setup();
      const appt = await book(patientToken, deptA.id, doctor.id);

      const res = await request(server())
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ newStartTime: SLOT_START_2 });

      expect(res.status).toBe(403);
    });

    it("blocks a different Patient from rescheduling someone else's appointment", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();
      const appt = await book(patientToken, deptA.id, doctor.id);

      const res = await request(server())
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set("Authorization", `Bearer ${otherPatientToken}`)
        .send({ newStartTime: SLOT_START_2 });

      expect(res.status).toBe(404);
    });

    it("rejects rescheduling past the maxReschedulesPerAppointment cap", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const appt = await book(patientToken, deptA.id, doctor.id);
      const slots = ["09:20", "09:40", "10:00", "10:20"].map((t) => `${testMonday()}T${t}:00.000Z`);

      for (const slot of slots.slice(0, 3)) {
        const res = await request(server())
          .patch(`/api/v1/appointments/${appt.id}/reschedule`)
          .set("Authorization", `Bearer ${patientToken}`)
          .send({ newStartTime: slot });
        expect(res.status).toBe(200);
      }

      const overCap = await request(server())
        .patch(`/api/v1/appointments/${appt.id}/reschedule`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ newStartTime: slots[3] });

      expect(overCap.status).toBe(422);
      expect(overCap.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });
  });

  describe("PATCH /appointments/:id/cancel", () => {
    it("lets a Patient cancel their own appointment", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .patch(`/api/v1/appointments/${booked.body.id}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ reason: "Can't make it" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("frees the slot for a new booking once cancelled", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      await request(server()).patch(`/api/v1/appointments/${booked.body.id}/cancel`).set("Authorization", `Bearer ${patientToken}`).send({});

      const rebooked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${otherPatientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      expect(rebooked.status).toBe(201);
    });

    it("rejects cancelling an already-cancelled appointment", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      await request(server()).patch(`/api/v1/appointments/${booked.body.id}/cancel`).set("Authorization", `Bearer ${patientToken}`).send({});

      const res = await request(server())
        .patch(`/api/v1/appointments/${booked.body.id}/cancel`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("APPOINTMENT_CANCELLED");
    });

    it("blocks a Doctor from cancelling (no appointments.cancel permission)", async () => {
      const { deptA, doctor, patientToken, doctorToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .patch(`/api/v1/appointments/${booked.body.id}/cancel`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe("POST /appointments/:id/checkin", () => {
    /** Booking requires >= minBookingLeadMinutes (60) notice, but check-in
     * only opens within checkinWindowMinutes (30) of startTime — those two
     * windows can never both hold at "now" for the same request. Book far
     * enough out to pass the lead-time check, then move the row's startTime
     * to just a few minutes away (direct Prisma write, not a reschedule) to
     * simulate "the appointment is imminent" for the check-in window check. */
    async function makeImminent(appointmentId: string, minutesFromNow: number): Promise<void> {
      await prisma.client.appointment.update({
        where: { id: appointmentId },
        data: { startTime: new Date(Date.now() + minutesFromNow * 60_000) },
      });
    }

    it("rejects check-in more than checkinWindowMinutes before start (E2E-CHECKIN-01)", async () => {
      // SLOT_START is 7+ days out — well outside the default 30-minute
      // check-in window — so booking it normally (no makeImminent) already
      // exercises the "too early" rejection.
      const { deptA, doctor, patientToken, receptionistToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .post(`/api/v1/appointments/${booked.body.id}/checkin`)
        .set("Authorization", `Bearer ${receptionistToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });

    it("checks in and assigns queue number 1 for the first check-in of the day", async () => {
      const { deptA, doctor, patientToken, receptionistToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      await makeImminent(booked.body.id, 10);

      const res = await request(server())
        .post(`/api/v1/appointments/${booked.body.id}/checkin`)
        .set("Authorization", `Bearer ${receptionistToken}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("CHECKED_IN");
      expect(res.body.queueNumber).toBe(1);
      expect(res.body.checkedInAt).toBeTruthy();
    });

    it("assigns sequential queue numbers within the same branch/department/day", async () => {
      const { deptA, doctor, patientToken, otherPatientToken, receptionistToken } = await setup();
      const first = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      const second = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${otherPatientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START_2 });
      await makeImminent(first.body.id, 10);
      await makeImminent(second.body.id, 15);

      await request(server()).post(`/api/v1/appointments/${first.body.id}/checkin`).set("Authorization", `Bearer ${receptionistToken}`);
      const res = await request(server())
        .post(`/api/v1/appointments/${second.body.id}/checkin`)
        .set("Authorization", `Bearer ${receptionistToken}`);

      expect(res.body.queueNumber).toBe(2);
    });

    it("lets a Patient self-check-in (SELF scope)", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });
      await makeImminent(booked.body.id, 10);

      const res = await request(server()).post(`/api/v1/appointments/${booked.body.id}/checkin`).set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(201);
    });

    it("blocks a different Patient from checking in someone else's appointment", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .post(`/api/v1/appointments/${booked.body.id}/checkin`)
        .set("Authorization", `Bearer ${otherPatientToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /appointments/:id/no-show", () => {
    it("blocks a Patient from marking their own appointment no-show", async () => {
      const { deptA, doctor, patientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .patch(`/api/v1/appointments/${booked.body.id}/no-show`)
        .set("Authorization", `Bearer ${patientToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it("rejects no-show before the grace period has elapsed", async () => {
      const { deptA, doctor, patientToken, doctorToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .patch(`/api/v1/appointments/${booked.body.id}/no-show`)
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
    });
  });

  describe("GET /appointments — tenant/scope isolation", () => {
    it("a Patient's list never includes another patient's appointment", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();
      await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${otherPatientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server()).get("/api/v1/appointments").set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it("GET /appointments/:id 404s for an appointment outside the caller's scope", async () => {
      const { deptA, doctor, patientToken, otherPatientToken } = await setup();
      const booked = await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server())
        .get(`/api/v1/appointments/${booked.body.id}`)
        .set("Authorization", `Bearer ${otherPatientToken}`);
      expect(res.status).toBe(404);
    });

    it("an Admin sees appointments across their whole hospital", async () => {
      const { deptA, doctor, patientToken, adminToken } = await setup();
      await request(server())
        .post("/api/v1/appointments")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ doctorId: doctor.id, departmentId: deptA.id, startTime: SLOT_START });

      const res = await request(server()).get("/api/v1/appointments").set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
