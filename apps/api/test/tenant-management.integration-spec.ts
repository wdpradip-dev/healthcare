import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { bootstrapTestApp } from "./setup-app";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createHospital, createStaffUser, signAccessTokenForUser } from "./fixtures";

/**
 * Hospital/Branch/Department CRUD, and — the primary point of this suite —
 * tenant isolation (T-408): every list/detail/mutate endpoint must reject a
 * cross-tenant read/write with 404/403, never disambiguating "doesn't exist"
 * from "exists in another tenant" (docs/18-MULTI-TENANCY.md, docs/28-ERROR-HANDLING.md).
 */
describe("Hospital/Branch/Department management (integration)", () => {
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
    await prisma.client.department.deleteMany();
    await prisma.client.branch.deleteMany();
    await prisma.client.hospitalSettings.deleteMany();
    await prisma.client.userRole.deleteMany({ where: { role: { key: { in: ["ADMIN", "SUPER_ADMIN"] } } } });
    await prisma.client.auditLog.deleteMany();
    await prisma.client.user.deleteMany({ where: { userRoles: { none: {} } } });
    await prisma.client.hospital.deleteMany();
  });

  const server = () => app.getHttpServer();

  async function setupTwoHospitals() {
    const hospitalA = await createHospital(prisma);
    const hospitalB = await createHospital(prisma);
    const adminA = await createStaffUser(prisma, { hospitalId: hospitalA.id, roleKey: "ADMIN" });
    const adminB = await createStaffUser(prisma, { hospitalId: hospitalB.id, roleKey: "ADMIN" });
    const superAdmin = await createStaffUser(prisma, { hospitalId: null, roleKey: "SUPER_ADMIN" });
    return {
      hospitalA,
      hospitalB,
      adminAToken: await signAccessTokenForUser(app, adminA.id),
      adminBToken: await signAccessTokenForUser(app, adminB.id),
      superAdminToken: await signAccessTokenForUser(app, superAdmin.id),
    };
  }

  describe("/hospitals (Super Admin only)", () => {
    it("rejects a non-Super-Admin with 403 FORBIDDEN", async () => {
      const { adminAToken } = await setupTwoHospitals();
      const res = await request(server()).get("/api/v1/hospitals").set("Authorization", `Bearer ${adminAToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("lets a Super Admin create and list hospitals platform-wide", async () => {
      const { superAdminToken } = await setupTwoHospitals();
      const createRes = await request(server())
        .post("/api/v1/hospitals")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ name: "New Hospital", slug: `new-hospital-${Date.now()}`, contactEmail: "new@example.test", contactPhone: "+15551234567" });
      expect(createRes.status).toBe(201);

      const listRes = await request(server()).get("/api/v1/hospitals").set("Authorization", `Bearer ${superAdminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThanOrEqual(3);
    });

    it("rejects a duplicate slug with a field-level VALIDATION_ERROR", async () => {
      const { hospitalA, superAdminToken } = await setupTwoHospitals();
      const res = await request(server())
        .post("/api/v1/hospitals")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ name: "Dup", slug: hospitalA.slug, contactEmail: "dup@example.test", contactPhone: "+15551234567" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details).toEqual([{ field: "slug", message: "This slug is already in use." }]);
    });

    it("suspends a hospital, which then blocks login for its staff", async () => {
      const { hospitalA, adminAToken, superAdminToken } = await setupTwoHospitals();
      const suspendRes = await request(server())
        .patch(`/api/v1/hospitals/${hospitalA.id}`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ status: "SUSPENDED" });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.status).toBe("SUSPENDED");

      // adminAToken is still a validly-signed, unexpired JWT — this proves
      // suspension is enforced at login (not just "already logged in"
      // sessions dying instantly), matching what login-flow checks can do.
      const adminA = await prisma.client.user.findFirstOrThrow({ where: { hospitalId: hospitalA.id, name: { contains: "ADMIN" } } });
      const loginRes = await request(server())
        .post("/api/v1/auth/login")
        .send({ identifier: adminA.email, password: "Password1" });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error.code).toBe("AUTH_HOSPITAL_SUSPENDED");
      void adminAToken;
    });
  });

  describe("/branches", () => {
    it("scopes list/create to the Admin's own hospital", async () => {
      const { adminAToken } = await setupTwoHospitals();
      const createRes = await request(server())
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Main Branch",
          address: "1 Main St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "USA",
          contactPhone: "+15551234567",
          operatingHours: { monday: { open: "08:00", close: "18:00" } },
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.hospitalId).toBeDefined();

      const listRes = await request(server()).get("/api/v1/branches").set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].name).toBe("Main Branch");
    });

    it("ignores a client-supplied hospitalId for an Admin — always uses their own JWT-embedded hospitalId", async () => {
      const { hospitalB, adminAToken } = await setupTwoHospitals();
      const res = await request(server())
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          hospitalId: hospitalB.id, // attempted override — must be ignored
          name: "Sneaky Branch",
          address: "1 Main St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "USA",
          contactPhone: "+15551234567",
          operatingHours: {},
        });
      expect(res.status).toBe(201);
      expect(res.body.hospitalId).not.toBe(hospitalB.id);
    });

    it("returns 404 (never 403) for a branch belonging to another hospital — no tenant-existence disambiguation", async () => {
      const { adminAToken, adminBToken } = await setupTwoHospitals();
      const createRes = await request(server())
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({
          name: "Hospital B Branch",
          address: "2 Second St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "USA",
          contactPhone: "+15551234567",
          operatingHours: {},
        });
      const branchId = createRes.body.id;

      const getRes = await request(server()).get(`/api/v1/branches/${branchId}`).set("Authorization", `Bearer ${adminAToken}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe("NOT_FOUND");

      const updateRes = await request(server())
        .patch(`/api/v1/branches/${branchId}`)
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ name: "Hijacked" });
      expect(updateRes.status).toBe(404);

      // And Hospital A's own list never includes it.
      const listRes = await request(server()).get("/api/v1/branches").set("Authorization", `Bearer ${adminAToken}`);
      expect(listRes.body).toHaveLength(0);
    });

    it("requires an explicit hospitalId for a Super Admin caller", async () => {
      const { superAdminToken } = await setupTwoHospitals();
      const res = await request(server()).get("/api/v1/branches").set("Authorization", `Bearer ${superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("/departments", () => {
    it("rejects a branchId belonging to a different hospital than the resolved tenant", async () => {
      const { adminAToken, adminBToken } = await setupTwoHospitals();
      const branchB = await request(server())
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({
          name: "Branch B",
          address: "2 Second St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "USA",
          contactPhone: "+15551234567",
          operatingHours: {},
        });

      const res = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ branchId: branchB.body.id, name: "Cardiology" });
      expect(res.status).toBe(400);
      expect(res.body.error.details?.[0]?.field).toBe("branchId");
    });

    it("creates a department under the actor's own hospital/branch and lists it with doctor assignments", async () => {
      const { adminAToken } = await setupTwoHospitals();
      const branch = await request(server())
        .post("/api/v1/branches")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Main Branch",
          address: "1 Main St",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "USA",
          contactPhone: "+15551234567",
          operatingHours: {},
        });

      const createRes = await request(server())
        .post("/api/v1/departments")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ branchId: branch.body.id, name: "Cardiology" });
      expect(createRes.status).toBe(201);

      const detailRes = await request(server())
        .get(`/api/v1/departments/${createRes.body.id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.doctorDepartments).toEqual([]);
    });
  });
});
