import { Injectable } from "@nestjs/common";
import type { Branch } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { CreateBranchInput, ListBranchesQuery, UpdateBranchInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";

/** Hospital-scoped CRUD — docs/15-API-SPECIFICATION.md "/branches". */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  // Explicit return types below avoid TS2742 ("inferred type ... cannot be
  // named without a reference to .../@prisma/client/runtime/library") — the
  // soft-delete-extended Prisma client's inferred result types aren't
  // portable across module boundaries without one.
  async list(actor: RequestUser, query: ListBranchesQuery): Promise<Branch[]> {
    const hospitalId = resolveHospitalId(actor, query.hospitalId);
    return this.prisma.client.branch.findMany({
      where: {
        hospitalId,
        status: query.status,
        ...(query.query ? { name: { contains: query.query, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<Branch> {
    const branch = await this.prisma.client.branch.findUnique({ where: { id } });
    // Never disambiguate "doesn't exist" from "exists in another tenant" —
    // docs/28-ERROR-HANDLING.md NOT_FOUND, docs/18-MULTI-TENANCY.md point 2.
    if (!branch || (actor.hospitalId && branch.hospitalId !== actor.hospitalId)) {
      throw new DomainException("NOT_FOUND", "Branch not found.");
    }
    return branch;
  }

  async create(actor: RequestUser, input: CreateBranchInput): Promise<Branch> {
    const hospitalId = resolveHospitalId(actor, input.hospitalId);
    return this.prisma.client.branch.create({ data: { ...input, hospitalId } });
  }

  async update(actor: RequestUser, id: string, input: UpdateBranchInput): Promise<Branch> {
    await this.getById(actor, id);
    return this.prisma.client.branch.update({ where: { id }, data: input });
  }
}
