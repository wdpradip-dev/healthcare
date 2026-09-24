import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { AiReportAssistProvider } from "@hospital/shared";
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
 * Phase 9 (docs/41-TASKS.md T-901–T-909): prescriptions (E2E-CONSULT-04
 * immutability/supersession), the report pipeline gate (E2E-REPORT-01–04),
 * AI provenance pairing, upload validation, signed-URL tamper resistance, and
 * document scoping. The AI provider is a stub — nothing here reaches Groq.
 */
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic report body")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]);

describe("Prescriptions, reports & documents (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ai = { isConfigured: true, summarize: jest.fn() } satisfies AiReportAssistProvider & { summarize: jest.Mock };

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp({ aiProvider: ai });
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ai.isConfigured = true;
    ai.summarize.mockReset();
    ai.summarize.mockResolvedValue({ summary: "Hemoglobin is within the stated range.", provider: "stub", model: "stub-1" });
  });

  afterEach(async () => {
    await prisma.client.prescriptionItem.deleteMany();
    await prisma.client.prescription.deleteMany();
    await prisma.client.document.deleteMany();
    await prisma.client.labReport.deleteMany();
    await prisma.client.imagingReport.deleteMany();
    await prisma.client.labOrder.deleteMany();
    await prisma.client.vital.deleteMany();
    await prisma.client.diagnosis.deleteMany();
    await prisma.client.clinicalNote.deleteMany();
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
    const deptA = await createDepartment(prisma, hospitalA.id, branchA.id);

    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });
    const { user: doctorUser, doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    const { user: otherDoctorUser } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
    const { user: patientUser, patient } = await createPatientProfile(prisma);
    const { user: otherPatientUser } = await createPatientProfile(prisma);
    const { user: nurseUser } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "NURSE" });

    const appointment = await prisma.client.appointment.create({
      data: {
        hospitalId: hospitalA.id,
        branchId: branchA.id,
        departmentId: deptA.id,
        doctorId: doctor.id,
        patientId: patient.id,
        startTime: new Date(Date.now() + 10 * 60_000),
        endTime: new Date(Date.now() + 30 * 60_000),
        status: "IN_PROGRESS",
        createdBy: adminA.id,
      },
    });
    const consultation = await prisma.client.consultation.create({
      data: { appointmentId: appointment.id, hospitalId: hospitalA.id, doctorId: doctor.id, patientId: patient.id, startedAt: new Date() },
    });

    return {
      hospitalA,
      patient,
      doctor,
      appointment,
      consultation,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
      doctorToken: await signAccessTokenForUser(app, doctorUser.id),
      otherDoctorToken: await signAccessTokenForUser(app, otherDoctorUser.id),
      patientToken: await signAccessTokenForUser(app, patientUser.id),
      otherPatientToken: await signAccessTokenForUser(app, otherPatientUser.id),
      nurseToken: await signAccessTokenForUser(app, nurseUser.id),
    };
  }

  type Ctx = Awaited<ReturnType<typeof setup>>;

  const completeConsultation = (ctx: Ctx) =>
    prisma.client.consultation.update({ where: { id: ctx.consultation.id }, data: { status: "COMPLETED", completedAt: new Date() } });

  async function firstMedicationId(): Promise<string> {
    return (await prisma.client.medication.findFirstOrThrow()).id;
  }

  const issue = (token: string, body: Record<string, unknown>) => request(server()).post("/api/v1/prescriptions").set(bearer(token)).send(body);

  describe("prescriptions", () => {
    it("lets the treating doctor issue one and hides it from the patient until the consultation completes", async () => {
      const ctx = await setup();
      const medicationId = await firstMedicationId();

      const res = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [
          { medicationId, dosage: "500mg", frequency: "twice daily", durationDays: 5 },
          { freeTextName: "Oral rehydration salts", dosage: "1 sachet", frequency: "as needed" },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.status).toBe("ACTIVE");

      const draftList = await request(server()).get("/api/v1/prescriptions").set(bearer(ctx.patientToken));
      expect(draftList.body).toHaveLength(0);
      expect((await request(server()).get(`/api/v1/prescriptions/${res.body.id}`).set(bearer(ctx.patientToken))).status).toBe(404);

      await completeConsultation(ctx);
      const list = await request(server()).get("/api/v1/prescriptions").set(bearer(ctx.patientToken));
      expect(list.body).toHaveLength(1);

      const audits = await prisma.client.auditLog.findMany({ where: { resourceType: "Prescription" } });
      expect(audits.map((a) => a.action)).toContain("PRESCRIPTION_CREATE");
    });

    it("refuses a nurse, an admin and a doctor who is not treating the patient", async () => {
      const ctx = await setup();
      const body = { consultationId: ctx.consultation.id, items: [{ freeTextName: "Paracetamol", dosage: "500mg", frequency: "daily" }] };

      expect((await issue(ctx.nurseToken, body)).status).toBe(403);
      expect((await issue(ctx.adminAToken, body)).status).toBe(403);
      expect((await issue(ctx.otherDoctorToken, body)).status).toBe(404);
    });

    it("rejects an item that names both a formulary medication and free text", async () => {
      const ctx = await setup();
      const res = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [{ medicationId: await firstMedicationId(), freeTextName: "X", dosage: "1", frequency: "daily" }],
      });
      expect(res.status).toBe(400);
    });

    it("corrects by supersession — the old row is immutable history and can only be superseded once (E2E-CONSULT-04)", async () => {
      const ctx = await setup();
      const first = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [{ freeTextName: "Amoxicillin", dosage: "250mg", frequency: "thrice daily" }],
      });

      const second = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        supersedesId: first.body.id,
        items: [{ freeTextName: "Amoxicillin", dosage: "500mg", frequency: "thrice daily" }],
      });
      expect(second.status).toBe(201);
      const old = await prisma.client.prescription.findUniqueOrThrow({ where: { id: first.body.id }, include: { items: true } });
      expect(old.status).toBe("SUPERSEDED");
      expect(old.items[0]?.dosage).toBe("250mg");

      const again = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        supersedesId: first.body.id,
        items: [{ freeTextName: "Amoxicillin", dosage: "1g", frequency: "daily" }],
      });
      expect(again.status).toBe(422);
      expect(again.body.error.code).toBe("CONSULTATION_STATE_INVALID");
    });

    it("offers no update route", async () => {
      const ctx = await setup();
      const created = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [{ freeTextName: "Ibuprofen", dosage: "200mg", frequency: "daily" }],
      });
      const res = await request(server()).patch(`/api/v1/prescriptions/${created.body.id}`).set(bearer(ctx.doctorToken)).send({});
      expect(res.status).toBe(404);
    });

    it("serves a real PDF through a signed URL and audits the view", async () => {
      const ctx = await setup();
      const created = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [{ freeTextName: "Cetirizine", dosage: "10mg", frequency: "nightly" }],
      });

      const pdf = await request(server()).get(`/api/v1/prescriptions/${created.body.id}/pdf`).set(bearer(ctx.doctorToken));
      expect(pdf.status).toBe(200);
      const file = await request(server()).get(pdf.body.url).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(file.status).toBe(200);
      expect(file.headers["content-type"]).toContain("application/pdf");
      expect((file.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

      const views = await prisma.client.auditLog.count({ where: { action: "PRESCRIPTION_VIEW" } });
      expect(views).toBeGreaterThan(0);
    });

    it("does not leak across hospitals or patients", async () => {
      const ctx = await setup();
      const created = await issue(ctx.doctorToken, {
        consultationId: ctx.consultation.id,
        items: [{ freeTextName: "Cetirizine", dosage: "10mg", frequency: "nightly" }],
      });
      await completeConsultation(ctx);

      expect((await request(server()).get(`/api/v1/prescriptions/${created.body.id}`).set(bearer(ctx.adminBToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/prescriptions/${created.body.id}`).set(bearer(ctx.otherPatientToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/prescriptions/${created.body.id}`).set(bearer(ctx.adminAToken))).status).toBe(200);
    });
  });

  async function orderTest(ctx: Ctx, token = ctx.doctorToken) {
    return request(server()).post("/api/v1/lab-orders").set(bearer(token)).send({ consultationId: ctx.consultation.id, testType: "Complete Blood Count" });
  }

  function uploadReport(token: string, labOrderId: string, extra: { values?: object; file?: Buffer; filename?: string; type?: "lab" | "imaging"; findings?: string } = {}) {
    const type = extra.type ?? "lab";
    const req = request(server())
      .post("/api/v1/reports")
      .set(bearer(token))
      .field("labOrderId", labOrderId)
      .field("type", type)
      .field("title", type === "lab" ? "CBC" : "Chest X-ray");
    if (extra.values) req.field("structuredValues", JSON.stringify(extra.values));
    if (extra.findings) req.field("findings", extra.findings);
    return req.attach("file", extra.file ?? PDF, { filename: extra.filename ?? "report.pdf" });
  }

  const CBC_VALUES = { Hemoglobin: { value: 13.2, unit: "g/dL", referenceRange: "12-16", flag: "NORMAL" } };

  describe("lab orders", () => {
    it("lets only the treating doctor order, and scopes reading", async () => {
      const ctx = await setup();
      expect((await orderTest(ctx)).status).toBe(201);
      expect((await orderTest(ctx, ctx.nurseToken)).status).toBe(403);
      expect((await orderTest(ctx, ctx.otherDoctorToken)).status).toBe(404);

      expect((await request(server()).get("/api/v1/lab-orders").set(bearer(ctx.doctorToken))).body).toHaveLength(1);
      // Admins hold no lab_orders.read (docs/02) — clinical orders are not an administrative surface.
      expect((await request(server()).get("/api/v1/lab-orders").set(bearer(ctx.adminBToken))).status).toBe(403);
      expect((await request(server()).get("/api/v1/lab-orders").set(bearer(ctx.nurseToken))).body).toHaveLength(1);
      expect((await request(server()).get("/api/v1/lab-orders").set(bearer(ctx.patientToken))).status).toBe(403);
    });

    it("refuses an order against a completed consultation", async () => {
      const ctx = await setup();
      await completeConsultation(ctx);
      const res = await orderTest(ctx);
      expect(res.status).toBe(422);
    });
  });

  describe("report pipeline", () => {
    it("never shows a report to the patient before RELEASED and releases via the verify gate (E2E-REPORT-01/02)", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);

      const created = await uploadReport(ctx.doctorToken, order.body.id);
      expect(created.status).toBe(201);
      expect(created.body.pipelineStatus).toBe("RAW");
      const id = created.body.id as string;

      const patientView = () => request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.patientToken));
      expect((await patientView()).status).toBe(404);
      expect((await request(server()).get("/api/v1/reports").set(bearer(ctx.patientToken))).body).toHaveLength(0);

      // RAW cannot be verified straight away.
      const early = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect(early.status).toBe(422);
      expect(early.body.error.code).toBe("REPORT_STATE_INVALID");

      const patched = await request(server()).patch(`/api/v1/reports/${id}`).set(bearer(ctx.doctorToken)).send({ structuredValues: CBC_VALUES });
      expect(patched.body.pipelineStatus).toBe("EXTRACTED");
      expect((await patientView()).status).toBe(404);

      const released = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect(released.status).toBe(201);
      expect(released.body.pipelineStatus).toBe("RELEASED");
      expect(released.body.aiSummary).toBeNull();

      const seen = await patientView();
      expect(seen.status).toBe(200);
      expect(seen.body.structuredValues.Hemoglobin.value).toBe(13.2);
      const orderRow = await prisma.client.labOrder.findUniqueOrThrow({ where: { id: order.body.id } });
      expect(orderRow.status).toBe("COMPLETED");
    });

    it("moves only forward — a released report cannot be edited, re-analyzed or re-verified", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;
      await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});

      const patch = await request(server()).patch(`/api/v1/reports/${id}`).set(bearer(ctx.doctorToken)).send({ structuredValues: CBC_VALUES });
      const analyze = await request(server()).post(`/api/v1/reports/${id}/analyze`).set(bearer(ctx.doctorToken));
      const verify = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      for (const res of [patch, analyze, verify]) {
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("REPORT_STATE_INVALID");
      }
    });

    it("requires an explicit decision on the AI summary and never releases it unreviewed (E2E-REPORT-03)", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      const analyzed = await request(server()).post(`/api/v1/reports/${id}/analyze`).set(bearer(ctx.doctorToken));
      expect(analyzed.body.aiAvailable).toBe(true);
      expect(analyzed.body.report.pipelineStatus).toBe("AI_ANALYZED");
      expect(analyzed.body.report.aiSummary).toMatchObject({ aiGenerated: true, reviewedBy: null });
      // Only structured values + title reach the provider — no patient identity.
      expect(JSON.stringify(ai.summarize.mock.calls[0])).not.toContain(created.body.patientName);

      const undecided = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect(undecided.status).toBe(400);
      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.patientToken))).status).toBe(404);

      const accepted = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({ aiSummaryDecision: "ACCEPT" });
      expect(accepted.status).toBe(201);

      const patientSees = await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.patientToken));
      expect(patientSees.body.aiSummary).toEqual({
        text: "Hemoglobin is within the stated range.",
        aiGenerated: true,
        reviewedBy: expect.stringContaining("DOCTOR"),
      });

      const audit = await prisma.client.auditLog.findFirstOrThrow({ where: { action: "REPORT_VERIFY" } });
      expect(audit.afterState).toMatchObject({ aiSummaryDecision: "ACCEPT" });
      const aiAudit = await prisma.client.auditLog.findFirstOrThrow({ where: { action: "REPORT_AI_ANALYZE" } });
      expect(aiAudit.afterState).toMatchObject({ provider: "stub", model: "stub-1" });
    });

    it("supports EDIT (the edited text is what the patient sees) and DISCARD (no AI content at all)", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);

      const editedReport = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      await request(server()).post(`/api/v1/reports/${editedReport.body.id}/analyze`).set(bearer(ctx.doctorToken));
      const missingText = await request(server()).post(`/api/v1/reports/${editedReport.body.id}/verify`).set(bearer(ctx.doctorToken)).send({ aiSummaryDecision: "EDIT" });
      expect(missingText.status).toBe(400);
      await request(server())
        .post(`/api/v1/reports/${editedReport.body.id}/verify`)
        .set(bearer(ctx.doctorToken))
        .send({ aiSummaryDecision: "EDIT", editedAiSummary: "Hemoglobin normal; recheck in 3 months." });
      const edited = await request(server()).get(`/api/v1/reports/${editedReport.body.id}`).set(bearer(ctx.patientToken));
      expect(edited.body.aiSummary.text).toBe("Hemoglobin normal; recheck in 3 months.");
      expect(edited.body.aiSummary.aiGenerated).toBe(true);

      const discarded = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      await request(server()).post(`/api/v1/reports/${discarded.body.id}/analyze`).set(bearer(ctx.doctorToken));
      await request(server()).post(`/api/v1/reports/${discarded.body.id}/verify`).set(bearer(ctx.doctorToken)).send({ aiSummaryDecision: "DISCARD" });
      const seen = await request(server()).get(`/api/v1/reports/${discarded.body.id}`).set(bearer(ctx.patientToken));
      expect(seen.body.aiSummary).toBeNull();
      const row = await prisma.client.labReport.findUniqueOrThrow({ where: { id: discarded.body.id } });
      expect(row.aiSummary).toBeNull();
      expect(row.aiGenerated).toBe(false);
    });

    it("carries on without AI when the provider is absent or fails (E2E-REPORT-04)", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      ai.isConfigured = false;
      const absent = await request(server()).post(`/api/v1/reports/${id}/analyze`).set(bearer(ctx.doctorToken));
      expect(absent.status).toBe(201);
      expect(absent.body.aiAvailable).toBe(false);
      expect(absent.body.report.pipelineStatus).toBe("EXTRACTED");

      ai.isConfigured = true;
      ai.summarize.mockResolvedValue(null);
      const failed = await request(server()).post(`/api/v1/reports/${id}/analyze`).set(bearer(ctx.doctorToken));
      expect(failed.body.aiAvailable).toBe(false);

      const verify = await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect(verify.status).toBe(201);
    });

    it("rejects a decision on a report that has no AI summary", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const res = await request(server()).post(`/api/v1/reports/${created.body.id}/verify`).set(bearer(ctx.doctorToken)).send({ aiSummaryDecision: "ACCEPT" });
      expect(res.status).toBe(400);
    });

    it("keeps write access to the ordering doctor and verification to reports.verify holders", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      expect((await uploadReport(ctx.otherDoctorToken, order.body.id)).status).toBe(404);
      expect((await uploadReport(ctx.nurseToken, order.body.id)).status).toBe(403);
      expect((await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.nurseToken)).send({})).status).toBe(403);
      expect((await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.adminAToken)).send({})).status).toBe(403);
      expect((await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.otherDoctorToken)).send({})).status).toBe(404);
      expect((await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.patientToken)).send({})).status).toBe(403);
    });

    it("handles imaging reports through the same surface", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { type: "imaging", findings: "Lungs clear.", file: PNG, filename: "xray.png" });
      expect(created.status).toBe(201);
      expect(created.body.type).toBe("imaging");
      expect(created.body.pipelineStatus).toBe("EXTRACTED");
      await request(server()).post(`/api/v1/reports/${created.body.id}/verify`).set(bearer(ctx.doctorToken)).send({});

      const list = await request(server()).get("/api/v1/reports?type=imaging").set(bearer(ctx.patientToken));
      expect(list.body).toHaveLength(1);
      expect(list.body[0].findings).toBe("Lungs clear.");
    });

    it("scopes staff reads by hospital, branch and patient relationship", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.adminAToken))).status).toBe(200);
      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.nurseToken))).status).toBe(200);
      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.adminBToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.otherDoctorToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/reports/${id}`).set(bearer(ctx.otherPatientToken))).status).toBe(404);
    });
  });

  describe("file validation and signed URLs", () => {
    it("rejects a non-PDF/JPEG/PNG file regardless of its name or declared type", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const res = await uploadReport(ctx.doctorToken, order.body.id, { file: Buffer.from("MZ not really a pdf"), filename: "report.pdf" });
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
      expect(await prisma.client.labReport.count()).toBe(0);
    });

    it("rejects a file over 10MB", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const big = Buffer.alloc(10 * 1024 * 1024 + 1);
      big.write("%PDF-1.4");
      const res = await uploadReport(ctx.doctorToken, order.body.id, { file: big });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    });

    it("requires a file", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const res = await request(server())
        .post("/api/v1/reports")
        .set(bearer(ctx.doctorToken))
        .field("labOrderId", order.body.id)
        .field("type", "lab")
        .field("title", "CBC");
      expect(res.status).toBe(400);
    });

    it("hands out a working, audited signed URL — and rejects a tampered or unknown token", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      const signed = await request(server()).get(`/api/v1/reports/${id}/file`).set(bearer(ctx.doctorToken));
      expect(signed.status).toBe(200);
      expect((await request(server()).get(signed.body.url)).status).toBe(200);

      const tampered = `${signed.body.url as string}x`;
      expect((await request(server()).get(tampered)).status).toBe(404);
      const swapped = (signed.body.url as string).replace(/\/files\/[^.]+/, "/files/AAAA");
      expect((await request(server()).get(swapped)).status).toBe(404);
      expect((await request(server()).get("/api/v1/files/not-a-token")).status).toBe(404);

      expect(await prisma.client.auditLog.count({ where: { action: "REPORT_DOWNLOAD" } })).toBe(1);
    });

    it("gives a patient the file only after release", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const id = created.body.id as string;

      expect((await request(server()).get(`/api/v1/reports/${id}/file`).set(bearer(ctx.patientToken))).status).toBe(404);
      await request(server()).post(`/api/v1/reports/${id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect((await request(server()).get(`/api/v1/reports/${id}/file`).set(bearer(ctx.patientToken))).status).toBe(200);
    });
  });

  describe("documents", () => {
    const uploadDoc = (token: string, fields: Record<string, string> = {}, file: Buffer = PNG) => {
      const req = request(server()).post("/api/v1/documents").set(bearer(token));
      for (const [k, v] of Object.entries(fields)) req.field(k, v);
      return req.attach("file", file, { filename: "scan.png" });
    };

    it("lets a patient upload and list their own documents, invisible to other patients", async () => {
      const ctx = await setup();
      const res = await uploadDoc(ctx.patientToken, { category: "ID_PROOF" });
      expect(res.status).toBe(201);
      expect(res.body.storageKey).toBeUndefined();
      expect(res.body.mimeType).toBe("image/png");

      expect((await request(server()).get("/api/v1/documents").set(bearer(ctx.patientToken))).body).toHaveLength(1);
      expect((await request(server()).get("/api/v1/documents").set(bearer(ctx.otherPatientToken))).body).toHaveLength(0);
      expect((await request(server()).get(`/api/v1/documents/${res.body.id}`).set(bearer(ctx.otherPatientToken))).status).toBe(404);
    });

    it("stops a patient from creating system categories or linking someone else's appointment", async () => {
      const ctx = await setup();
      expect((await uploadDoc(ctx.patientToken, { category: "REPORT_ATTACHMENT" })).status).toBe(400);
      expect((await uploadDoc(ctx.otherPatientToken, { linkedEntityType: "Appointment", linkedEntityId: ctx.appointment.id })).status).toBe(404);
      expect((await uploadDoc(ctx.patientToken, { linkedEntityType: "Consultation", linkedEntityId: ctx.consultation.id })).status).toBe(403);
    });

    it("rejects an invalid file and an unsupported uploader", async () => {
      const ctx = await setup();
      expect((await uploadDoc(ctx.patientToken, {}, Buffer.from("plain text"))).status).toBe(415);
      // Admins hold documents.read only.
      expect((await uploadDoc(ctx.adminAToken, { patientId: ctx.patient.id })).status).toBe(403);
    });

    it("lets a treating doctor attach to their patient's consultation and requires a real relationship", async () => {
      const ctx = await setup();
      const ok = await uploadDoc(ctx.doctorToken, { patientId: ctx.patient.id, linkedEntityType: "Consultation", linkedEntityId: ctx.consultation.id });
      expect(ok.status).toBe(201);
      expect(ok.body.hospitalId).toBe(ctx.hospitalA.id);

      expect((await uploadDoc(ctx.otherDoctorToken, { patientId: ctx.patient.id })).status).toBe(404);
      expect((await uploadDoc(ctx.doctorToken, {})).status).toBe(400);
    });

    it("issues an audited signed download and keeps other hospitals out", async () => {
      const ctx = await setup();
      const created = await uploadDoc(ctx.doctorToken, { patientId: ctx.patient.id });

      const dl = await request(server()).get(`/api/v1/documents/${created.body.id}/download`).set(bearer(ctx.patientToken));
      expect(dl.status).toBe(200);
      expect((await request(server()).get(dl.body.url)).status).toBe(200);
      expect(await prisma.client.auditLog.count({ where: { action: "DOCUMENT_DOWNLOAD" } })).toBe(1);

      expect((await request(server()).get(`/api/v1/documents/${created.body.id}`).set(bearer(ctx.adminBToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/documents/${created.body.id}`).set(bearer(ctx.adminAToken))).status).toBe(200);
    });

    it("does not leak an unreleased report's source file through the documents surface", async () => {
      const ctx = await setup();
      const order = await orderTest(ctx);
      const created = await uploadReport(ctx.doctorToken, order.body.id, { values: CBC_VALUES });
      const doc = await prisma.client.document.findFirstOrThrow({ where: { category: "REPORT_ATTACHMENT" } });

      expect((await request(server()).get("/api/v1/documents").set(bearer(ctx.patientToken))).body).toHaveLength(0);
      expect((await request(server()).get(`/api/v1/documents/${doc.id}`).set(bearer(ctx.patientToken))).status).toBe(404);
      expect((await request(server()).get(`/api/v1/documents/${doc.id}/download`).set(bearer(ctx.patientToken))).status).toBe(404);
      expect((await request(server()).get("/api/v1/documents").set(bearer(ctx.doctorToken)).query({ patientId: ctx.patient.id })).body).toHaveLength(1);

      await request(server()).post(`/api/v1/reports/${created.body.id}/verify`).set(bearer(ctx.doctorToken)).send({});
      expect((await request(server()).get("/api/v1/documents").set(bearer(ctx.patientToken))).body).toHaveLength(1);
    });
  });
});
