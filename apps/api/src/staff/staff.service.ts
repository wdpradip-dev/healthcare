import { Injectable } from "@nestjs/common";
import type { Prisma } from "@hospital/database";
import { DomainException } from "@hospital/shared";
import type { ListStaffQuery, UpdateStaffInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { RefreshTokenService } from "../auth/refresh-token.service";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";

type StaffPayload = Prisma.StaffGetPayload<{ include: { user: true; branch: true } }>;

// GetPayload's static type doesn't know about the client-wide passwordHash
// default (packages/database/src/client.ts) — Omit<..., "passwordHash"> here
// matches what the query actually returns at runtime.
export type StaffWithUser = Omit<StaffPayload, "user"> & { user: Omit<StaffPayload["user"], "passwordHash"> };

/**
 * Hospital-scoped non-doctor employee (Nurse/Receptionist/Admin) profile —
 * docs/15-API-SPECIFICATION.md "/staff". There is no `POST /staff`: the row
 * is created implicitly by `POST /users/invite` (Phase 4).
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  // Explicit return types below avoid TS2742 — see departments.service.ts's
  // comment on the same fix.
  async list(actor: RequestUser, query: ListStaffQuery): Promise<StaffWithUser[]> {
    const hospitalId = resolveHospitalId(actor, query.hospitalId);
    return this.prisma.client.staff.findMany({
      where: {
        hospitalId,
        deletedAt: null,
        branchId: query.branchId,
        status: query.status,
        ...(query.query ? { user: { name: { contains: query.query, mode: "insensitive" } } } : {}),
      },
      include: { user: true, branch: true },
      orderBy: { user: { name: "asc" } },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<StaffWithUser> {
    const staff = await this.prisma.client.staff.findUnique({
      where: { id },
      include: { user: true, branch: true },
    });
    if (!staff || staff.deletedAt || (actor.hospitalId && staff.hospitalId !== actor.hospitalId)) {
      throw new DomainException("NOT_FOUND", "Staff member not found.");
    }
    return staff;
  }

  async update(actor: RequestUser, id: string, input: UpdateStaffInput): Promise<StaffWithUser> {
    const existing = await this.getById(actor, id);

    if (input.branchId) {
      const branch = await this.prisma.client.branch.findUnique({ where: { id: input.branchId } });
      if (!branch || branch.hospitalId !== existing.hospitalId) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "branchId", message: "This branch does not belong to this staff member's hospital." },
        ]);
      }
    }

    if (input.status === "INACTIVE") {
      return this.deactivate(actor, id);
    }

    await this.prisma.client.staff.update({
      where: { id },
      data: {
        jobTitle: input.jobTitle,
        branchId: input.branchId,
        ...(input.status === "ACTIVE" ? { status: "ACTIVE" } : {}),
      },
    });
    if (input.status === "ACTIVE") {
      await this.prisma.client.user.update({ where: { id: existing.userId }, data: { status: "ACTIVE" } });
    }

    return this.getById(actor, id);
  }

  async deactivate(actor: RequestUser, id: string): Promise<StaffWithUser> {
    const staff = await this.getById(actor, id);

    await this.prisma.client.staff.update({ where: { id }, data: { status: "INACTIVE" } });
    await this.prisma.client.user.update({ where: { id: staff.userId }, data: { status: "DISABLED" } });
    await this.refreshTokenService.revokeAllForUser(staff.userId);

    return this.getById(actor, id);
  }
}
