import { Injectable } from "@nestjs/common";
import type { Department, Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { CreateDepartmentInput, ListDepartmentsQuery, UpdateDepartmentInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";

export type DepartmentWithDoctors = Prisma.DepartmentGetPayload<{
  include: { doctorDepartments: { include: { doctor: true } } };
}>;

/** Hospital-scoped CRUD — docs/15-API-SPECIFICATION.md "/departments". */
@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Explicit return types below avoid TS2742 — see branches.service.ts's
  // comment on the same fix.
  async list(actor: RequestUser, query: ListDepartmentsQuery): Promise<DepartmentWithDoctors[]> {
    const hospitalId = resolveHospitalId(actor, query.hospitalId);
    return this.prisma.client.department.findMany({
      where: {
        hospitalId,
        branchId: query.branchId,
        ...(query.query ? { name: { contains: query.query, mode: "insensitive" } } : {}),
      },
      // The admin Departments list shows a doctor count per row
      // (docs/09-ADMIN-DESIGN-MOCKUPS.md "Departments"), so this needs the
      // same relation getById() loads — a list/detail response-shape
      // mismatch here previously crashed the admin UI (`doctorDepartments`
      // undefined) since only getById() included it.
      include: { doctorDepartments: { include: { doctor: true } } },
      orderBy: { name: "asc" },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<DepartmentWithDoctors> {
    const department = await this.prisma.client.department.findUnique({
      where: { id },
      include: { doctorDepartments: { include: { doctor: true } } },
    });
    if (!department || (actor.hospitalId && department.hospitalId !== actor.hospitalId)) {
      throw new DomainException("NOT_FOUND", "Department not found.");
    }
    return department;
  }

  async create(actor: RequestUser, input: CreateDepartmentInput): Promise<Department> {
    const hospitalId = resolveHospitalId(actor, input.hospitalId);
    // Defense-in-depth cross-reference check (docs/18-MULTI-TENANCY.md point
    // 4): a Branch id from a different Hospital must never be attachable
    // here, even though the guard/scope check above already covers the
    // common case of a wrong-tenant actor.
    await this.assertBranchBelongsToHospital(input.branchId, hospitalId);
    return this.prisma.client.department.create({
      data: { name: input.name, description: input.description, branchId: input.branchId, hospitalId },
    });
  }

  async update(actor: RequestUser, id: string, input: UpdateDepartmentInput): Promise<Department> {
    const existing = await this.getById(actor, id);
    if (input.branchId) {
      await this.assertBranchBelongsToHospital(input.branchId, existing.hospitalId);
    }
    return this.prisma.client.department.update({ where: { id }, data: input });
  }

  private async assertBranchBelongsToHospital(branchId: string, hospitalId: string): Promise<void> {
    const branch = await this.prisma.client.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.hospitalId !== hospitalId) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "branchId", message: "This branch does not belong to the target hospital." },
      ]);
    }
  }
}
