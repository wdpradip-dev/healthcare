import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Branch, Department, Doctor, HospitalSettings, User } from "@hospital/database";
import { hashPassword } from "@hospital/shared";
import { AccessTokenService } from "../src/common/jwt/access-token.service";
import { AuthzResolverService } from "../src/auth/authz-resolver.service";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * Test-only fixture builders for the Phase 4 domain modules (Hospital,
 * Branch, Department, User) — creates rows directly via Prisma (bypassing
 * the invite/activation HTTP flow, already covered by its own tests) and
 * signs a real access token via the same `AccessTokenService`/
 * `AuthzResolverService` the real login flow uses, so a fixture's token is
 * exactly as authentic as one issued by `POST /auth/login`.
 */
export async function createHospital(prisma: PrismaService, overrides: Partial<{ name: string; slug: string }> = {}) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.client.hospital.create({
    data: {
      name: overrides.name ?? `Test Hospital ${suffix}`,
      slug: overrides.slug ?? `test-hospital-${suffix}`,
      contactEmail: `contact-${suffix}@example.test`,
      contactPhone: "+15550000000",
    },
  });
}

export async function createStaffUser(
  prisma: PrismaService,
  params: { hospitalId: string | null; roleKey: "ADMIN" | "SUPER_ADMIN" | "NURSE" | "RECEPTIONIST" | "DOCTOR" },
) {
  const suffix = randomUUID().slice(0, 8);
  const role = await prisma.client.role.findFirstOrThrow({ where: { hospitalId: null, key: params.roleKey } });
  const passwordHash = await hashPassword("Password1");
  const user = await prisma.client.user.create({
    data: {
      hospitalId: params.hospitalId,
      name: `Test ${params.roleKey} ${suffix}`,
      email: `${params.roleKey.toLowerCase()}-${suffix}@example.test`,
      passwordHash,
      status: "ACTIVE",
      userRoles: { create: { roleId: role.id } },
    },
  });
  return user;
}

export async function createBranch(prisma: PrismaService, hospitalId: string, overrides: Partial<{ name: string }> = {}): Promise<Branch> {
  const suffix = randomUUID().slice(0, 8);
  return prisma.client.branch.create({
    data: {
      hospitalId,
      name: overrides.name ?? `Test Branch ${suffix}`,
      address: "1 Main St",
      city: "Springfield",
      state: "IL",
      postalCode: "62701",
      country: "USA",
      contactPhone: "+15550000000",
      operatingHours: {},
    },
  });
}

/** Phase 5 addition — createStaffUser() only provisions User+UserRole; this
 * also creates the linked Staff row, for tests that exercise `/staff` directly
 * rather than going through the `POST /users/invite` HTTP flow. */
export async function createStaffMember(
  prisma: PrismaService,
  params: { hospitalId: string; branchId?: string | null; roleKey: "NURSE" | "RECEPTIONIST" | "ADMIN"; jobTitle?: string },
) {
  const user = await createStaffUser(prisma, { hospitalId: params.hospitalId, roleKey: params.roleKey });
  const staff = await prisma.client.staff.create({
    data: { userId: user.id, hospitalId: params.hospitalId, branchId: params.branchId ?? null, jobTitle: params.jobTitle },
  });
  return { user, staff };
}

/** Phase 5 addition — createStaffUser(..., roleKey: "DOCTOR") provisions the
 * invited User+UserRole only (matching `POST /users/invite`'s own behavior,
 * docs/15-API-SPECIFICATION.md "Create (links to invited User)"); this also
 * attaches the Doctor profile, for tests that don't exercise `POST /doctors` itself. */
export async function createDoctorProfile(
  prisma: PrismaService,
  params: { hospitalId: string },
): Promise<{ user: Omit<User, "passwordHash">; doctor: Doctor }> {
  const user = await createStaffUser(prisma, { hospitalId: params.hospitalId, roleKey: "DOCTOR" });
  const doctor = await prisma.client.doctor.create({
    data: { userId: user.id, hospitalId: params.hospitalId, qualifications: "MBBS" },
  });
  return { user, doctor };
}

/** Phase 5 addition — a Patient's own User is never hospital-scoped
 * (docs/18-MULTI-TENANCY.md), so `registeredHospitalId`/`registeredBranchId`
 * are the only tenant-adjacent fields to set up here. */
export async function createPatientProfile(
  prisma: PrismaService,
  params: { registeredHospitalId?: string | null; registeredBranchId?: string | null } = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const role = await prisma.client.role.findFirstOrThrow({ where: { hospitalId: null, key: "PATIENT" } });
  const passwordHash = await hashPassword("Password1");
  const user = await prisma.client.user.create({
    data: {
      hospitalId: null,
      name: `Test Patient ${suffix}`,
      email: `patient-${suffix}@example.test`,
      passwordHash,
      status: "ACTIVE",
      userRoles: { create: { roleId: role.id } },
    },
  });
  const patient = await prisma.client.patient.create({
    data: {
      userId: user.id,
      registeredHospitalId: params.registeredHospitalId ?? null,
      registeredBranchId: params.registeredBranchId ?? null,
    },
  });
  return { user, patient };
}

/** Phase 6 addition. */
export async function createDepartment(
  prisma: PrismaService,
  hospitalId: string,
  branchId: string,
  overrides: Partial<{ name: string }> = {},
): Promise<Department> {
  const suffix = randomUUID().slice(0, 8);
  return prisma.client.department.create({
    data: { hospitalId, branchId, name: overrides.name ?? `Test Department ${suffix}` },
  });
}

/** Phase 6 addition — `HospitalsService.create()` now provisions this
 * automatically via the real API, but `createHospital()` above (a direct
 * Prisma insert, bypassing the service) does not; tests that need a valid
 * `HospitalSettings.timezone` for availability computation call this
 * explicitly instead of switching every existing `createHospital()` caller
 * over to the HTTP route. */
export async function createHospitalSettings(
  prisma: PrismaService,
  hospitalId: string,
  updatedBy: string,
  overrides: Partial<{ timezone: string }> = {},
): Promise<HospitalSettings> {
  return prisma.client.hospitalSettings.create({
    data: { hospitalId, updatedBy, timezone: overrides.timezone ?? "UTC" },
  });
}

/** Phase 7 addition — a DoctorSchedule row inserted directly (bypassing
 * `PUT /schedules/:doctorId`, which forces `effectiveFrom = today`) so
 * appointment-booking tests can target a fixed future date without racing
 * "today" as the suite ages. Mirrors `toTimeValue()` in doctor-schedule.service.ts. */
export async function createDoctorScheduleBlock(
  prisma: PrismaService,
  params: {
    hospitalId: string;
    doctorId: string;
    departmentId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes?: number;
    bufferMinutes?: number;
    maxAppointments?: number | null;
  },
) {
  return prisma.client.doctorSchedule.create({
    data: {
      hospitalId: params.hospitalId,
      doctorId: params.doctorId,
      departmentId: params.departmentId,
      dayOfWeek: params.dayOfWeek,
      startTime: new Date(`1970-01-01T${params.startTime}:00Z`),
      endTime: new Date(`1970-01-01T${params.endTime}:00Z`),
      slotDurationMinutes: params.slotDurationMinutes ?? 20,
      bufferMinutes: params.bufferMinutes ?? 0,
      maxAppointments: params.maxAppointments ?? null,
      effectiveFrom: new Date("2020-01-01T00:00:00Z"),
      effectiveTo: null,
    },
  });
}

export async function signAccessTokenForUser(app: INestApplication, userId: string): Promise<string> {
  const authzResolver = app.get(AuthzResolverService);
  const accessTokenService = app.get(AccessTokenService);
  const authz = await authzResolver.resolve(userId);
  return accessTokenService.sign({
    sub: userId,
    hospitalId: authz.hospitalId,
    roles: authz.roles,
    permissions: authz.permissions,
  });
}
