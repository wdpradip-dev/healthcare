import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createBranch,
  createDepartment,
  createDoctorProfile,
  createHospital,
  createPatientProfile,
  createStaffMember,
  createStaffUser,
  signAccessTokenForUser,
} from "./fixtures";

/**
 * Phase 8 (docs/41-TASKS.md T-801–T-807): the consultation state machine
 * (E2E-CONSULT-01–03), internal-note exclusion, the Doctor-vs-Nurse write
 * split, and medical-record scope/tenant isolation. Appointments are inserted
 * directly at `CHECKED_IN` — the booking/check-in path is Phase 7's own suite.
 */
describe("Consultations & medical records (integration)", () => {
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
    await prisma.client.vital.deleteMany();
    await prisma.client.diagnosis.deleteMany();
    await prisma.client.clinicalNote.deleteMany();
    await prisma.client.medicalCondition.deleteMany();
    await prisma.client.allergy.deleteMany();
    await prisma.client.consultation.deleteMany();
    await prisma.client.appointmentHistory.deleteMany();
    await prisma.client.appointment.deleteMany();
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
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function setup() {
    const hospitalA = await createHospital(prisma);
    const hospitalB = await createHospital(prisma);
    const branchA = await createBranch(prisma, hospitalA.id);
    const otherBranchA = await createBranch(prisma, hospitalA.id);
    const deptA = await createDepartment(prisma, hospitalA.id, branchA.id);

    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });

    const { user: doctorUser, doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    const { user: otherDoctorUser } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    await prisma.client.doctorDepartment.create({ data: { doctorId: doctor.id, departmentId: deptA.id } });

    const { user: patientUser, patient } = await createPatientProfile(prisma);
    const { user: otherPatientUser } = await createPatientProfile(prisma);
    const { user: nurseUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "NURSE" });
    const { user: otherBranchNurseUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: otherBranchA.id, roleKey: "NURSE" });
    const { user: receptionistUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "RECEPTIONIST" });

    async function checkedInAppointment(status: "CHECKED_IN" | "SCHEDULED" = "CHECKED_IN") {
      return prisma.client.appointment.create({
        data: {
          hospitalId: hospitalA.id,
          branchId: branchA.id,
          departmentId: deptA.id,
          doctorId: doctor.id,
          patientId: patient.id,
          startTime: new Date(Date.now() + 10 * 60_000),
          endTime: new Date(Date.now() + 30 * 60_000),
          status,
          createdBy: adminA.id,
        },
      });
    }

    return {
      hospitalA,
      patient,
      doctor,
      checkedInAppointment,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
      doctorToken: await signAccessTokenForUser(app, doctorUser.id),
      otherDoctorToken: await signAccessTokenForUser(app, otherDoctorUser.id),
      patientToken: await signAccessTokenForUser(app, patientUser.id),
      otherPatientToken: await signAccessTokenForUser(app, otherPatientUser.id),
      nurseToken: await signAccessTokenForUser(app, nurseUser.id),
      otherBranchNurseToken: await signAccessTokenForUser(app, otherBranchNurseUser.id),
      receptionistToken: await signAccessTokenForUser(app, receptionistUser.id),
    };
  }

  async function startConsultation(token: string, appointmentId: string) {
    return request(server()).post("/api/v1/consultations").set(bearer(token)).send({ appointmentId });
  }

  describe("POST /consultations (start)", () => {
    it("lets the treating Doctor start a consultation for a CHECKED_IN appointment", async () => {
      const { checkedInAppointment, doctorToken } = await setup();
      const appt = await checkedInAppointment();

      const res = await startConsultation(doctorToken, appt.id);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("IN_PROGRESS");
      expect(res.body.startedAt).toBeTruthy();
      const updated = await prisma.client.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      expect(updated.status).toBe("IN_PROGRESS");
    });

    it("rejects starting against a SCHEDULED (not checked-in) appointment (E2E-CONSULT-02)", async () => {
      const { checkedInAppointment, doctorToken } = await setup();
      const appt = await checkedInAppointment("SCHEDULED");

      const res = await startConsultation(doctorToken, appt.id);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("CONSULTATION_STATE_INVALID");
    });

    it("rejects a second start for the same appointment", async () => {
      const { checkedInAppointment, doctorToken } = await setup();
      const appt = await checkedInAppointment();
      await startConsultation(doctorToken, appt.id);

      const res = await startConsultation(doctorToken, appt.id);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("CONSULTATION_STATE_INVALID");
    });

    it("404s for a different Doctor's appointment", async () => {
      const { checkedInAppointment, otherDoctorToken } = await setup();
      const appt = await checkedInAppointment();

      const res = await startConsultation(otherDoctorToken, appt.id);

      expect(res.status).toBe(404);
    });

    it("blocks Patient, Nurse and Receptionist (no consultations.write / not a Doctor)", async () => {
      const { checkedInAppointment, patientToken, nurseToken, receptionistToken } = await setup();
      const appt = await checkedInAppointment();

      for (const token of [patientToken, nurseToken, receptionistToken]) {
        const res = await startConsultation(token, appt.id);
        expect(res.status).toBe(403);
      }
    });
  });

  describe("PATCH /consultations/:id and complete", () => {
    async function started() {
      const ctx = await setup();
      const appt = await ctx.checkedInAppointment();
      const res = await startConsultation(ctx.doctorToken, appt.id);
      return { ...ctx, appt, consultationId: res.body.id as string };
    }

    it("saves notes, diagnoses and vitals in one autosave call", async () => {
      const { doctorToken, consultationId } = await started();

      const res = await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({
          notes: [{ content: "Mild headaches.", isInternal: false }],
          diagnoses: [{ icd10Code: "I10", description: "Essential hypertension" }],
          vitals: { bloodPressureSystolic: 128, bloodPressureDiastolic: 82, heartRate: 76 },
        });

      expect(res.status).toBe(200);
      expect(res.body.clinicalNotes).toHaveLength(1);
      expect(res.body.diagnoses).toHaveLength(1);
      expect(res.body.vitals).toHaveLength(1);
    });

    it("is idempotent for autosave: repeated vitals/diagnoses/note-id saves never duplicate rows", async () => {
      const { doctorToken, consultationId } = await started();
      const first = await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({ notes: [{ content: "v1", isInternal: false }], diagnoses: [{ description: "X" }], vitals: { heartRate: 70 } });
      const noteId = first.body.clinicalNotes[0].id as string;

      const second = await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({ notes: [{ id: noteId, content: "v2", isInternal: false }], diagnoses: [{ description: "X" }], vitals: { heartRate: 72 } });

      expect(second.body.clinicalNotes).toHaveLength(1);
      expect(second.body.clinicalNotes[0].content).toBe("v2");
      expect(second.body.diagnoses).toHaveLength(1);
      expect(second.body.vitals).toHaveLength(1);
      expect(second.body.vitals[0].heartRate).toBe(72);
    });

    it("rejects completing with no notes or diagnosis (E2E-CONSULT-03)", async () => {
      const { doctorToken, consultationId } = await started();

      const res = await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("completes: consultation and appointment become COMPLETED, history row written", async () => {
      const { doctorToken, consultationId, appt } = await started();
      await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({ diagnoses: [{ description: "Viral fever" }] });

      const res = await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("COMPLETED");
      const updated = await prisma.client.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { history: true } });
      expect(updated.status).toBe("COMPLETED");
      expect(updated.history.map((h) => h.action)).toContain("COMPLETED");
    });

    it("refuses edits once completed", async () => {
      const { doctorToken, consultationId } = await started();
      await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({ diagnoses: [{ description: "Viral fever" }] });
      await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      const res = await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(doctorToken))
        .send({ notes: [{ content: "late", isInternal: false }] });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("CONSULTATION_STATE_INVALID");
    });

    it("blocks another Doctor from editing someone else's consultation", async () => {
      const { otherDoctorToken, consultationId } = await started();

      const res = await request(server())
        .patch(`/api/v1/consultations/${consultationId}`)
        .set(bearer(otherDoctorToken))
        .send({ notes: [{ content: "x", isInternal: false }] });

      expect(res.status).toBe(404);
    });
  });

  describe("Nurse vitals (PATCH /consultations/:id/vitals)", () => {
    it("lets a Nurse at the appointment's branch record vitals, but not edit notes/diagnoses", async () => {
      const ctx = await setup();
      const appt = await ctx.checkedInAppointment();
      const { body } = await startConsultation(ctx.doctorToken, appt.id);

      const vitals = await request(server())
        .patch(`/api/v1/consultations/${body.id}/vitals`)
        .set(bearer(ctx.nurseToken))
        .send({ bloodPressureSystolic: 120, bloodPressureDiastolic: 80 });
      expect(vitals.status).toBe(200);
      expect(vitals.body.vitals).toHaveLength(1);

      const edit = await request(server())
        .patch(`/api/v1/consultations/${body.id}`)
        .set(bearer(ctx.nurseToken))
        .send({ notes: [{ content: "x", isInternal: false }] });
      expect(edit.status).toBe(403);
    });

    it("404s for a Nurse at a different branch", async () => {
      const ctx = await setup();
      const appt = await ctx.checkedInAppointment();
      const { body } = await startConsultation(ctx.doctorToken, appt.id);

      const res = await request(server())
        .patch(`/api/v1/consultations/${body.id}/vitals`)
        .set(bearer(ctx.otherBranchNurseToken))
        .send({ heartRate: 80 });

      expect(res.status).toBe(404);
    });

    it("rejects an empty vitals body", async () => {
      const ctx = await setup();
      const appt = await ctx.checkedInAppointment();
      const { body } = await startConsultation(ctx.doctorToken, appt.id);

      const res = await request(server()).patch(`/api/v1/consultations/${body.id}/vitals`).set(bearer(ctx.nurseToken)).send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /consultations/:id — visibility and internal notes (T-807)", () => {
    async function completedWithInternalNote() {
      const ctx = await setup();
      const appt = await ctx.checkedInAppointment();
      const { body } = await startConsultation(ctx.doctorToken, appt.id);
      await request(server())
        .patch(`/api/v1/consultations/${body.id}`)
        .set(bearer(ctx.doctorToken))
        .send({
          notes: [
            { content: "Shared with patient.", isInternal: false },
            { content: "Clinician-only suspicion.", isInternal: true },
          ],
        });
      return { ...ctx, consultationId: body.id as string };
    }

    it("hides in-progress consultations from the Patient", async () => {
      const { patientToken, consultationId } = await completedWithInternalNote();

      const res = await request(server()).get(`/api/v1/consultations/${consultationId}`).set(bearer(patientToken));

      expect(res.status).toBe(404);
    });

    it("never returns isInternal notes to the Patient, but does to the Doctor and Nurse (E2E-CONSULT-01)", async () => {
      const { patientToken, doctorToken, nurseToken, consultationId } = await completedWithInternalNote();
      await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      const patientView = await request(server()).get(`/api/v1/consultations/${consultationId}`).set(bearer(patientToken));
      expect(patientView.status).toBe(200);
      expect(patientView.body.clinicalNotes.map((n: { content: string }) => n.content)).toEqual(["Shared with patient."]);
      expect(JSON.stringify(patientView.body)).not.toContain("Clinician-only");

      for (const token of [doctorToken, nurseToken]) {
        const view = await request(server()).get(`/api/v1/consultations/${consultationId}`).set(bearer(token));
        expect(view.body.clinicalNotes).toHaveLength(2);
      }
    });

    it("also hides internal notes from an Admin (non-clinical viewer)", async () => {
      const { adminAToken, doctorToken, consultationId } = await completedWithInternalNote();
      await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      const res = await request(server()).get(`/api/v1/consultations/${consultationId}`).set(bearer(adminAToken));

      expect(res.status).toBe(200);
      expect(res.body.clinicalNotes).toHaveLength(1);
    });

    it("isolates by scope: other patient, other-branch nurse, other hospital's admin all get 404", async () => {
      const { otherPatientToken, otherBranchNurseToken, adminBToken, doctorToken, consultationId } = await completedWithInternalNote();
      await request(server()).post(`/api/v1/consultations/${consultationId}/complete`).set(bearer(doctorToken));

      for (const token of [otherPatientToken, otherBranchNurseToken, adminBToken]) {
        const res = await request(server()).get(`/api/v1/consultations/${consultationId}`).set(bearer(token));
        expect(res.status).toBe(404);
      }
    });
  });

  describe("/medical-records", () => {
    async function completedConsultation(ctx: Awaited<ReturnType<typeof setup>>) {
      const appt = await ctx.checkedInAppointment();
      const { body } = await startConsultation(ctx.doctorToken, appt.id);
      await request(server())
        .patch(`/api/v1/consultations/${body.id}`)
        .set(bearer(ctx.doctorToken))
        .send({ diagnoses: [{ icd10Code: "I10", description: "Hypertension" }] });
      await request(server()).post(`/api/v1/consultations/${body.id}/complete`).set(bearer(ctx.doctorToken));
      return body.id as string;
    }

    it("a Patient sees their own completed consultations (with diagnosis) and never someone else's", async () => {
      const ctx = await setup();
      await completedConsultation(ctx);

      const own = await request(server()).get("/api/v1/medical-records").set(bearer(ctx.patientToken));
      expect(own.status).toBe(200);
      expect(own.body).toHaveLength(1);
      expect(own.body[0].diagnoses[0].description).toBe("Hypertension");

      const other = await request(server()).get("/api/v1/medical-records").set(bearer(ctx.otherPatientToken));
      expect(other.body).toHaveLength(0);
    });

    it("a Patient's supplied patientId is ignored — they only ever get their own record", async () => {
      const ctx = await setup();
      await completedConsultation(ctx);

      const res = await request(server())
        .get(`/api/v1/medical-records?patientId=${ctx.patient.id}`)
        .set(bearer(ctx.otherPatientToken));

      expect(res.body).toHaveLength(0);
    });

    it("a Doctor needs an actual appointment relationship with the patient", async () => {
      const ctx = await setup();
      await completedConsultation(ctx);

      const related = await request(server()).get(`/api/v1/medical-records?patientId=${ctx.patient.id}`).set(bearer(ctx.doctorToken));
      expect(related.status).toBe(200);
      expect(related.body).toHaveLength(1);

      const unrelated = await request(server()).get(`/api/v1/medical-records?patientId=${ctx.patient.id}`).set(bearer(ctx.otherDoctorToken));
      expect(unrelated.status).toBe(404);
    });

    it("staff must name a patient", async () => {
      const { doctorToken } = await setup();
      const res = await request(server()).get("/api/v1/medical-records").set(bearer(doctorToken));
      expect(res.status).toBe(400);
    });

    it("tenant isolation: another hospital's Admin sees none of this hospital's records", async () => {
      const ctx = await setup();
      await completedConsultation(ctx);

      const res = await request(server()).get(`/api/v1/medical-records?patientId=${ctx.patient.id}`).set(bearer(ctx.adminBToken));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it("a Doctor records an allergy and condition; the Patient then sees them and the summary", async () => {
      const ctx = await setup();
      await completedConsultation(ctx);

      const allergy = await request(server())
        .post("/api/v1/medical-records/allergies")
        .set(bearer(ctx.doctorToken))
        .send({ patientId: ctx.patient.id, allergen: "Penicillin", reaction: "Rash", severity: "SEVERE" });
      expect(allergy.status).toBe(201);
      const condition = await request(server())
        .post("/api/v1/medical-records/conditions")
        .set(bearer(ctx.doctorToken))
        .send({ patientId: ctx.patient.id, name: "Hypertension", status: "CHRONIC" });
      expect(condition.status).toBe(201);

      const summary = await request(server()).get("/api/v1/medical-records/summary").set(bearer(ctx.patientToken));
      expect(summary.status).toBe(200);
      expect(summary.body.allergies).toHaveLength(1);
      expect(summary.body.activeConditions).toHaveLength(1);
      expect(summary.body.consultationCount).toBe(1);
      expect(summary.body.recentConsultations).toHaveLength(1);
    });

    it("only a Doctor may write conditions/allergies — Nurse and Patient are refused", async () => {
      const ctx = await setup();
      const body = { patientId: ctx.patient.id, allergen: "Latex", severity: "MILD" };

      for (const token of [ctx.nurseToken, ctx.patientToken]) {
        const res = await request(server()).post("/api/v1/medical-records/allergies").set(bearer(token)).send(body);
        expect(res.status).toBe(403);
      }
    });
  });
});
