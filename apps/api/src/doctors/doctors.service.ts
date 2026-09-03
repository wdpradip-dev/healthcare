import { Injectable } from "@nestjs/common";
import type { Doctor, Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { AssignDoctorDepartmentInput, CreateDoctorInput, ListDoctorsQuery, UpdateDoctorInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";

type DoctorPayload = Prisma.DoctorGetPayload<{
  include: { user: true; doctorDepartments: { include: { department: true } } };
}>;

// GetPayload's static type doesn't know about the client-wide passwordHash
// default (packages/database/src/client.ts) — Omit<..., "passwordHash"> here
// matches what the query actually returns at runtime.
export type DoctorWithRelations = Omit<DoctorPayload, "user"> & { user: Omit<DoctorPayload["user"], "passwordHash"> };

/**
 * Hospital-scoped Doctor profile CRUD — docs/15-API-SPECIFICATION.md
 * "/doctors". `POST /doctors` attaches a clinical profile to a User already
 * invited with the DOCTOR role (Phase 4's `POST /users/invite`); it never
 * creates a User itself.
 */
@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  // Explicit return types below avoid TS2742 — see departments.service.ts's
  // comment on the same fix.
  async list(actor: RequestUser, query: ListDoctorsQuery): Promise<DoctorWithRelations[]> {
    const scope = await this.resolveReadScope(actor, query.hospitalId);
    const branchId = query.branchId ?? scope.branchId;
    return this.prisma.client.doctor.findMany({
      where: {
        ...(scope.hospitalId ? { hospitalId: scope.hospitalId } : {}),
        deletedAt: null,
        ...(query.departmentId ? { doctorDepartments: { some: { departmentId: query.departmentId } } } : {}),
        ...(branchId ? { doctorDepartments: { some: { department: { branchId } } } } : {}),
        ...(query.query ? { user: { name: { contains: query.query, mode: "insensitive" } } } : {}),
      },
      include: { user: true, doctorDepartments: { include: { department: true } } },
      orderBy: { user: { name: "asc" } },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<DoctorWithRelations> {
    const doctor = await this.prisma.client.doctor.findUnique({
      where: { id },
      include: { user: true, doctorDepartments: { include: { department: true } } },
    });
    if (!doctor || doctor.deletedAt) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }

    const scope = await this.resolveReadScope(actor);
    if (scope.hospitalId && doctor.hospitalId !== scope.hospitalId) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    if (scope.branchId && !doctor.doctorDepartments.some((dd) => dd.department.branchId === scope.branchId)) {
      throw new DomainException("NOT_FOUND", "Doctor not found.");
    }
    return doctor;
  }

  /**
   * `doctors.read` scope per docs/02-PERSONAS-AND-ROLES.md's matrix: `PATIENT`
   * and `SUPER_ADMIN` are `PLATFORM` (no hospital filter unless the caller
   * supplies one — cross-hospital discovery is the point), `ADMIN` is
   * `HOSPITAL` (always their own, never a client override), `RECEPTIONIST`
   * is `BRANCH` (narrower than their hospital). `NURSE`/`DOCTOR` hold no
   * `doctors.read` permission at all, so AuthorizationGuard rejects them
   * before this is ever reached.
   */
  private async resolveReadScope(actor: RequestUser, suppliedHospitalId?: string): Promise<{ hospitalId?: string; branchId?: string }> {
    const role = actor.roles[0];
    if (role === "ADMIN") {
      return { hospitalId: resolveHospitalId(actor, suppliedHospitalId) };
    }
    if (role === "RECEPTIONIST") {
      const hospitalId = resolveHospitalId(actor, suppliedHospitalId);
      const staff = await this.prisma.client.staff.findUnique({ where: { userId: actor.sub } });
      return staff?.branchId ? { hospitalId, branchId: staff.branchId } : { hospitalId };
    }
    // PATIENT / SUPER_ADMIN — PLATFORM: an explicit hospitalId narrows the
    // search but is never required.
    return suppliedHospitalId ? { hospitalId: suppliedHospitalId } : {};
  }

  async create(actor: RequestUser, input: CreateDoctorInput): Promise<Doctor> {
    const hospitalId = resolveHospitalId(actor, input.hospitalId);
    await this.assertUserIsInvitedDoctor(input.userId, hospitalId);

    if (input.departmentIds?.length) {
      await this.assertDepartmentsBelongToHospital(input.departmentIds, hospitalId);
    }

    return this.prisma.client.doctor.create({
      data: {
        hospitalId,
        userId: input.userId,
        qualifications: input.qualifications,
        bio: input.bio,
        yearsOfExperience: input.yearsOfExperience,
        consultationFee: input.consultationFee,
        defaultConsultationDurationMinutes: input.defaultConsultationDurationMinutes,
        photoUrl: input.photoUrl,
        ...(input.departmentIds?.length
          ? { doctorDepartments: { create: input.departmentIds.map((departmentId) => ({ departmentId })) } }
          : {}),
      },
    });
  }

  async update(actor: RequestUser, id: string, input: UpdateDoctorInput): Promise<Doctor> {
    await this.getById(actor, id);
    return this.prisma.client.doctor.update({ where: { id }, data: input });
  }

  async assignDepartment(actor: RequestUser, id: string, input: AssignDoctorDepartmentInput): Promise<DoctorWithRelations> {
    const doctor = await this.getById(actor, id);
    await this.assertDepartmentsBelongToHospital([input.departmentId], doctor.hospitalId);

    const existing = await this.prisma.client.doctorDepartment.findUnique({
      where: { doctorId_departmentId: { doctorId: id, departmentId: input.departmentId } },
    });
    if (existing) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "departmentId", message: "This doctor is already assigned to this department." },
      ]);
    }

    await this.prisma.client.doctorDepartment.create({
      data: { doctorId: id, departmentId: input.departmentId, isPrimary: input.isPrimary ?? false },
    });
    return this.getById(actor, id);
  }

  async removeDepartment(actor: RequestUser, id: string, departmentId: string): Promise<DoctorWithRelations> {
    const doctor = await this.getById(actor, id);
    await this.prisma.client.doctorDepartment.deleteMany({ where: { doctorId: doctor.id, departmentId } });
    return this.getById(actor, id);
  }

  private async assertUserIsInvitedDoctor(userId: string, hospitalId: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || user.hospitalId !== hospitalId) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "userId", message: "This user does not belong to the target hospital." },
      ]);
    }
    if (!user.userRoles.some((userRole) => userRole.role.key === "DOCTOR")) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "userId", message: "This user was not invited with the Doctor role." },
      ]);
    }
    const existingProfile = await this.prisma.client.doctor.findUnique({ where: { userId } });
    if (existingProfile) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "userId", message: "This user already has a Doctor profile." },
      ]);
    }
  }

  private async assertDepartmentsBelongToHospital(departmentIds: string[], hospitalId: string): Promise<void> {
    const count = await this.prisma.client.department.count({ where: { id: { in: departmentIds }, hospitalId } });
    if (count !== departmentIds.length) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "departmentIds", message: "One or more departments do not belong to the target hospital." },
      ]);
    }
  }
}
