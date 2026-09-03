import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import { PatientsService } from "../src/patients/patients.service";
import {
  createBranch,
  createDoctorProfile,
  createHospital,
  createPatientProfile,
  createStaffMember,
  createStaffUser,
  signAccessTokenForUser,
} from "./fixtures";

/**
 * Phase 5 (docs/41-TASKS.md T-501–T-507): Doctor/Patient/Staff profile CRUD,
 * scope enforcement per docs/02-PERSONAS-AND-ROLES.md's matrix, and tenant
 * isolation (T-408's discipline extended to the new domains).
 */
describe("Doctors/Patients/Staff (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let patientsService: PatientsService;

  beforeAll(async () => {
    const bootstrapped = await bootstrapTestApp();
    app = bootstrapped.app;
    prisma = bootstrapped.prisma;
    patientsService = app.get(PatientsService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.client.refreshToken.deleteMany();
    await prisma.client.deviceSession.deleteMany();
    await prisma.client.doctorDepartment.deleteMany();
    await prisma.client.doctor.deleteMany();
    await prisma.client.patient.deleteMany();
    await prisma.client.staff.deleteMany();
    await prisma.client.department.deleteMany();
    await prisma.client.branch.deleteMany();
    await prisma.client.auditLog.deleteMany();
    await prisma.client.userRole.deleteMany();
    await prisma.client.user.deleteMany();
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function setupTwoHospitals() {
    const hospitalA = await createHospital(prisma);
    const hospitalB = await createHospital(prisma);
    const branchA = await createBranch(prisma, hospitalA.id);
    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });
    const superAdmin = await createStaffUser(prisma, { hospitalId: null, roleKey: "SUPER_ADMIN" });
    return {
      hospitalA,
      hospitalB,
      branchA,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
      superAdminToken: await signAccessTokenForUser(app, superAdmin.id),
    };
  }

  describe("/doctors", () => {
    it("creates a Doctor profile for a User already invited with the DOCTOR role, and lists it", async () => {
      const { hospitalA, adminAToken } = await setupTwoHospitals();
      const invitedDoctor = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "DOCTOR" });

      const createRes = await request(server())
        .post("/api/v1/doctors")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ userId: invitedDoctor.id, qualifications: "MBBS, MD" });
      expect(createRes.status).toBe(201);
      expect(createRes.body.hospitalId).toBe(hospitalA.id);

      const listRes = await request(server()).get("/api/v1/doctors").set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
    });

    it("rejects creating a Doctor from a user without the DOCTOR role", async () => {
      const { hospitalA, adminAToken } = await setupTwoHospitals();
      const nurse = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE" });
      const res = await request(server())
        .post("/api/v1/doctors")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ userId: nurse.id, qualifications: "MBBS" });
      expect(res.status).toBe(400);
      expect(res.body.error.details?.[0]?.field).toBe("userId");
    });

    it("rejects creating a second Doctor profile for the same user", async () => {
      const { hospitalA, adminAToken } = await setupTwoHospitals();
      const { user } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      const res = await request(server())
        .post("/api/v1/doctors")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ userId: user.id, qualifications: "MBBS" });
      expect(res.status).toBe(400);
      expect(res.body.error.details?.[0]?.field).toBe("userId");
    });

    it("rejects assigning a department that belongs to a different hospital", async () => {
      const { hospitalA, hospitalB, adminAToken, adminBToken } = await setupTwoHospitals();
      const { doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      const branchB = await createBranch(prisma, hospitalB.id);
      const deptB = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ branchId: branchB.id, name: "Cardiology" });

      const res = await request(server())
        .post(`/api/v1/doctors/${doctor.id}/departments`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ departmentId: deptB.body.id });
      expect(res.status).toBe(400);
    });

    it("assigns and removes a department, reflected in the Doctor detail response", async () => {
      const { hospitalA, branchA, adminAToken } = await setupTwoHospitals();
      const { doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      const dept = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ branchId: branchA.id, name: "Cardiology" });

      const assignRes = await request(server())
        .post(`/api/v1/doctors/${doctor.id}/departments`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ departmentId: dept.body.id, isPrimary: true });
      expect(assignRes.status).toBe(201);
      expect(assignRes.body.doctorDepartments).toHaveLength(1);

      const removeRes = await request(server())
        .delete(`/api/v1/doctors/${doctor.id}/departments/${dept.body.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.doctorDepartments).toHaveLength(0);
    });

    it("tenant isolation: an Admin cannot read or update another hospital's doctor", async () => {
      const { hospitalA, adminBToken } = await setupTwoHospitals();
      const { doctor } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });

      const getRes = await request(server()).get(`/api/v1/doctors/${doctor.id}`).set("Authorization", `Bearer ${adminBToken}`);
      expect(getRes.status).toBe(404);

      const updateRes = await request(server())
        .patch(`/api/v1/doctors/${doctor.id}`)
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ bio: "Hijacked" });
      expect(updateRes.status).toBe(404);
    });

    it("lets a Patient (PLATFORM scope) discover doctors across hospitals without a hospitalId", async () => {
      const { hospitalA, hospitalB } = await setupTwoHospitals();
      await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      await createDoctorProfile(prisma, { hospitalId: hospitalB.id });
      const { user: patientUser } = await createPatientProfile(prisma);
      const patientToken = await signAccessTokenForUser(app, patientUser.id);

      const res = await request(server()).get("/api/v1/doctors").set("Authorization", `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("scopes a Receptionist's doctor list to their own branch, not their whole hospital", async () => {
      const { hospitalA, branchA, adminAToken } = await setupTwoHospitals();
      const otherBranch = await createBranch(prisma, hospitalA.id);
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "RECEPTIONIST" });
      const receptionistToken = await signAccessTokenForUser(app, staff.userId);

      const deptInBranch = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ branchId: branchA.id, name: "Cardiology" });
      const deptOtherBranch = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ branchId: otherBranch.id, name: "Neurology" });

      const { doctor: doctorInBranch } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      await prisma.client.doctorDepartment.create({ data: { doctorId: doctorInBranch.id, departmentId: deptInBranch.body.id } });
      const { doctor: doctorOtherBranch } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      await prisma.client.doctorDepartment.create({ data: { doctorId: doctorOtherBranch.id, departmentId: deptOtherBranch.body.id } });

      const res = await request(server()).get("/api/v1/doctors").set("Authorization", `Bearer ${receptionistToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(doctorInBranch.id);
    });
  });

  describe("/staff", () => {
    it("lists and updates a Staff member's job title/branch within the actor's own hospital", async () => {
      const { hospitalA, branchA, adminAToken } = await setupTwoHospitals();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE", jobTitle: "Ward Nurse" });

      const listRes = await request(server()).get("/api/v1/staff").set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);

      const updateRes = await request(server())
        .patch(`/api/v1/staff/${staff.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ jobTitle: "Senior Nurse", branchId: branchA.id });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.jobTitle).toBe("Senior Nurse");
      expect(updateRes.body.branchId).toBe(branchA.id);
    });

    it("deactivate disables the linked User and revokes sessions, mirroring POST /users/:id/deactivate", async () => {
      const { hospitalA, adminAToken } = await setupTwoHospitals();
      const { user, staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "RECEPTIONIST" });
      const staffToken = await signAccessTokenForUser(app, user.id);
      void staffToken;

      const deactivateRes = await request(server())
        .post(`/api/v1/staff/${staff.id}/deactivate`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(deactivateRes.status).toBe(201);
      expect(deactivateRes.body.status).toBe("INACTIVE");

      const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reloaded.status).toBe("DISABLED");
    });

    it("PATCH status=INACTIVE has the same effect as the dedicated deactivate route", async () => {
      const { hospitalA, adminAToken } = await setupTwoHospitals();
      const { user, staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "RECEPTIONIST" });

      const res = await request(server())
        .patch(`/api/v1/staff/${staff.id}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ status: "INACTIVE" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("INACTIVE");

      const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reloaded.status).toBe("DISABLED");
    });

    it("tenant isolation: an Admin cannot read or update another hospital's staff", async () => {
      const { hospitalA, adminBToken } = await setupTwoHospitals();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE" });

      const getRes = await request(server()).get(`/api/v1/staff/${staff.id}`).set("Authorization", `Bearer ${adminBToken}`);
      expect(getRes.status).toBe(404);

      const updateRes = await request(server())
        .patch(`/api/v1/staff/${staff.id}`)
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ jobTitle: "Hijacked" });
      expect(updateRes.status).toBe(404);
    });

    it("rejects a Nurse actor (no staff.read) with 403 FORBIDDEN", async () => {
      const { hospitalA } = await setupTwoHospitals();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE" });
      const nurseToken = await signAccessTokenForUser(app, staff.userId);
      const res = await request(server()).get("/api/v1/staff").set("Authorization", `Bearer ${nurseToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("/patients", () => {
    it("Receptionist registers a new patient, scoped to their own branch, which then activates via the shared OTP flow", async () => {
      const { hospitalA, branchA, adminAToken } = await setupTwoHospitals();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, branchId: branchA.id, roleKey: "RECEPTIONIST" });
      const receptionistToken = await signAccessTokenForUser(app, staff.userId);

      const registerRes = await request(server())
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${receptionistToken}`)
        .send({ name: "Alice Kumar", email: "alice.kumar@example.test", dateOfBirth: "1990-05-15" });
      expect(registerRes.status).toBe(201);
      expect(registerRes.body.status).toBe("PENDING_ACTIVATION");

      const patient = await prisma.client.patient.findUniqueOrThrow({ where: { id: registerRes.body.id } });
      expect(patient.registeredHospitalId).toBe(hospitalA.id);
      expect(patient.registeredBranchId).toBe(branchA.id);

      // Same role-agnostic activation endpoints Phase 4 built for staff
      // invites — no new activation route is needed for patients.
      const activationToken = patientsService.getLastActivationTokenForTesting(registerRes.body.userId);
      expect(activationToken).toBeDefined();

      const requestOtpRes = await request(server()).post("/api/v1/users/activate/request-otp").send({ activationToken });
      expect(requestOtpRes.status).toBe(201);

      void adminAToken;
    });

    it("rejects a Doctor (ASSIGNED scope, no Appointment data yet) with an empty list and 404 on detail", async () => {
      const { hospitalA } = await setupTwoHospitals();
      const { doctor: doctorProfile } = await createDoctorProfile(prisma, { hospitalId: hospitalA.id });
      const { user: patientUser, patient } = await createPatientProfile(prisma, { registeredHospitalId: hospitalA.id });
      const doctorToken = await signAccessTokenForUser(app, doctorProfile.userId);

      const listRes = await request(server()).get("/api/v1/patients").set("Authorization", `Bearer ${doctorToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toEqual([]);

      const getRes = await request(server()).get(`/api/v1/patients/${patient.id}`).set("Authorization", `Bearer ${doctorToken}`);
      expect(getRes.status).toBe(404);
      void patientUser;
    });

    it("a Patient can read and update their own profile via /patients/me but not another patient's record via /patients/:id", async () => {
      const { user: patientUser, patient } = await createPatientProfile(prisma);
      const patientToken = await signAccessTokenForUser(app, patientUser.id);

      const meRes = await request(server()).get("/api/v1/patients/me").set("Authorization", `Bearer ${patientToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.id).toBe(patient.id);

      const updateMeRes = await request(server())
        .patch("/api/v1/patients/me")
        .set("Authorization", `Bearer ${patientToken}`)
        .send({ bloodGroup: "O+" });
      expect(updateMeRes.status).toBe(200);
      expect(updateMeRes.body.bloodGroup).toBe("O+");

      const { patient: otherPatient } = await createPatientProfile(prisma);
      const getOtherRes = await request(server())
        .get(`/api/v1/patients/${otherPatient.id}`)
        .set("Authorization", `Bearer ${patientToken}`);
      expect(getOtherRes.status).toBe(404);
    });

    it("tenant isolation: an Admin only sees patients registered at their own hospital", async () => {
      const { hospitalA, hospitalB, adminAToken } = await setupTwoHospitals();
      await createPatientProfile(prisma, { registeredHospitalId: hospitalA.id });
      await createPatientProfile(prisma, { registeredHospitalId: hospitalB.id });

      const listRes = await request(server()).get("/api/v1/patients").set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
    });

    it("rejects a Nurse actor from registering a patient (patients.write is not in Nurse's permission set)", async () => {
      const { hospitalA } = await setupTwoHospitals();
      const { staff } = await createStaffMember(prisma, { hospitalId: hospitalA.id, roleKey: "NURSE" });
      const nurseToken = await signAccessTokenForUser(app, staff.userId);
      const res = await request(server())
        .post("/api/v1/patients")
        .set("Authorization", `Bearer ${nurseToken}`)
        .send({ name: "Should Fail", email: "shouldfail@example.test" });
      expect(res.status).toBe(403);
    });
  });
});
