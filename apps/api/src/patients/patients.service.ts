import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@hospital/database";
import { DomainException, hashPassword } from "@hospital/shared";
import type { ListPatientsQuery, RegisterPatientInput, UpdatePatientInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";
import { ActivationTokenService } from "../common/jwt/activation-token.service";
import { maskIdentifier } from "../auth/mask-identifier.util";
import { resolveHospitalId } from "../common/tenant-scope.util";
import type { RequestUser } from "../common/types/request-user";

type PatientPayload = Prisma.PatientGetPayload<{
  include: { user: true; registeredHospital: true; registeredBranch: true };
}>;

// GetPayload's static type doesn't know about the client-wide passwordHash
// default (packages/database/src/client.ts) — Omit<..., "passwordHash"> here
// matches what the query actually returns at runtime.
export type PatientWithUser = Omit<PatientPayload, "user"> & { user: Omit<PatientPayload["user"], "passwordHash"> };

const STAFF_REGISTRAR_ROLES = new Set(["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"]);

/**
 * `/patients` — docs/15-API-SPECIFICATION.md and docs/18-MULTI-TENANCY.md
 * "Patient identity is the one platform-level exception". Scope here narrows
 * per role rather than by a single `hospitalId` equality check, since a
 * Patient's own identity is never hospital-scoped — only
 * `registeredHospitalId`/`registeredBranchId` (who registered them) and, for
 * a Doctor, an actual appointment relationship (not yet queryable data,
 * Phase 7) are meaningful filters.
 */
@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);
  private readonly lastActivationTokenByUserId = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activationTokenService: ActivationTokenService,
  ) {}

  async list(actor: RequestUser, query: ListPatientsQuery): Promise<PatientWithUser[]> {
    const scope = await this.resolveScope(actor, query.hospitalId);
    if (scope === "NONE") {
      return [];
    }
    if (scope === "SELF") {
      const own = await this.prisma.client.patient.findUnique({
        where: { userId: actor.sub },
        include: { user: true, registeredHospital: true, registeredBranch: true },
      });
      return own ? [own] : [];
    }

    return this.prisma.client.patient.findMany({
      where: {
        ...scope.where,
        ...(query.branchId ? { registeredBranchId: query.branchId } : {}),
        user: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.query ? { name: { contains: query.query, mode: "insensitive" } } : {}),
        },
      },
      include: { user: true, registeredHospital: true, registeredBranch: true },
      orderBy: { user: { name: "asc" } },
    });
  }

  async getById(actor: RequestUser, id: string): Promise<PatientWithUser> {
    const patient = await this.prisma.client.patient.findUnique({
      where: { id },
      include: { user: true, registeredHospital: true, registeredBranch: true },
    });
    if (!patient) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }

    const scope = await this.resolveScope(actor);
    if (scope === "NONE") {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    if (scope === "SELF") {
      if (patient.userId !== actor.sub) {
        throw new DomainException("NOT_FOUND", "Patient not found.");
      }
      return patient;
    }
    if (scope.hospitalId && patient.registeredHospitalId !== scope.hospitalId) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    if (scope.branchId && patient.registeredBranchId !== scope.branchId) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    return patient;
  }

  async getMe(actor: RequestUser): Promise<PatientWithUser> {
    const patient = await this.prisma.client.patient.findUnique({
      where: { userId: actor.sub },
      include: { user: true, registeredHospital: true, registeredBranch: true },
    });
    if (!patient) {
      throw new DomainException("NOT_FOUND", "Patient not found.");
    }
    return patient;
  }

  async updateMe(actor: RequestUser, input: UpdatePatientInput): Promise<PatientWithUser> {
    const patient = await this.getMe(actor);
    return this.applyUpdate(patient.id, input);
  }

  async register(actor: RequestUser, input: RegisterPatientInput): Promise<{ id: string; userId: string; status: string }> {
    if (!STAFF_REGISTRAR_ROLES.has(actor.roles[0] ?? "")) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    const hospitalId = resolveHospitalId(actor, input.hospitalId);

    const existing = await this.prisma.client.user.findFirst({
      where: {
        OR: [input.email ? { email: input.email } : undefined, input.phone ? { phone: input.phone } : undefined].filter(
          (clause): clause is { email: string } | { phone: string } => clause !== undefined,
        ),
      },
    });
    if (existing) {
      throw new DomainException("AUTH_EMAIL_ALREADY_EXISTS", "This email or phone is already registered.");
    }

    let branchId: string | undefined;
    if (actor.roles[0] === "RECEPTIONIST") {
      // patients.write is BRANCH-scoped for a Receptionist (docs/02-PERSONAS-AND-ROLES.md)
      // — their own branch always wins, never a client-supplied one, matching
      // resolveHospitalId's "never trust a client override for a scoped actor" rule.
      branchId = (await this.prisma.client.staff.findUnique({ where: { userId: actor.sub } }))?.branchId ?? undefined;
    } else if (input.branchId) {
      const branch = await this.prisma.client.branch.findUnique({ where: { id: input.branchId } });
      if (!branch || branch.hospitalId !== hospitalId) {
        throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
          { field: "branchId", message: "This branch does not belong to the target hospital." },
        ]);
      }
      branchId = input.branchId;
    }

    const role = await this.prisma.client.role.findFirst({ where: { hospitalId: null, key: "PATIENT" } });
    if (!role) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "roleKey", message: "PATIENT role is not configured." },
      ]);
    }

    // Never usable — see users.service.ts invite()'s identical rationale.
    const placeholderPasswordHash = await hashPassword(randomBytes(32).toString("hex"));

    const user = await this.prisma.client.user.create({
      data: {
        // A Patient's User is never hospital-scoped (docs/18-MULTI-TENANCY.md).
        hospitalId: null,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: placeholderPasswordHash,
        status: "PENDING_ACTIVATION",
        userRoles: { create: { roleId: role.id } },
        patient: {
          create: {
            dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
            gender: input.gender,
            bloodGroup: input.bloodGroup,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            city: input.city,
            state: input.state,
            postalCode: input.postalCode,
            country: input.country,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            registeredHospitalId: hospitalId,
            registeredBranchId: branchId,
          },
        },
      },
      include: { patient: true },
    });

    const activationToken = this.activationTokenService.sign(user.id);
    this.deliverActivationLink(user.id, input.email ?? input.phone!, activationToken);

    return { id: user.patient!.id, userId: user.id, status: user.status };
  }

  async update(actor: RequestUser, id: string, input: UpdatePatientInput): Promise<PatientWithUser> {
    if (!STAFF_REGISTRAR_ROLES.has(actor.roles[0] ?? "")) {
      throw new DomainException("FORBIDDEN", "You do not have permission to perform this action.");
    }
    await this.getById(actor, id);
    return this.applyUpdate(id, input);
  }

  private async applyUpdate(id: string, input: UpdatePatientInput): Promise<PatientWithUser> {
    await this.prisma.client.patient.update({
      where: { id },
      data: {
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gender: input.gender,
        bloodGroup: input.bloodGroup,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
      },
    });
    if (input.name || input.phone) {
      const patient = await this.prisma.client.patient.findUniqueOrThrow({ where: { id } });
      await this.prisma.client.user.update({
        where: { id: patient.userId },
        data: { name: input.name, phone: input.phone },
      });
    }
    return this.prisma.client.patient.findUniqueOrThrow({
      where: { id },
      include: { user: true, registeredHospital: true, registeredBranch: true },
    });
  }

  /**
   * Resolves the `where` filter (or a sentinel) for the caller's
   * `patients.read`/`write` scope — see docs/02-PERSONAS-AND-ROLES.md's
   * scope matrix. `"NONE"` means "never returns rows" (Doctor, Nurse/
   * Receptionist read is allowed but Doctor's `ASSIGNED` scope has no
   * queryable backing data until Phase 7); `"SELF"` means "only the
   * caller's own Patient row."
   */
  private async resolveScope(
    actor: RequestUser,
    suppliedHospitalId?: string,
  ): Promise<"NONE" | "SELF" | { where: Prisma.PatientWhereInput; hospitalId?: string; branchId?: string }> {
    const role = actor.roles[0];
    if (role === "SUPER_ADMIN") {
      const hospitalId = suppliedHospitalId;
      return hospitalId ? { where: { registeredHospitalId: hospitalId }, hospitalId } : { where: {} };
    }
    if (role === "ADMIN") {
      const hospitalId = resolveHospitalId(actor, suppliedHospitalId);
      return { where: { registeredHospitalId: hospitalId }, hospitalId };
    }
    if (role === "NURSE" || role === "RECEPTIONIST") {
      const hospitalId = resolveHospitalId(actor, suppliedHospitalId);
      const staff = await this.prisma.client.staff.findUnique({ where: { userId: actor.sub } });
      if (staff?.branchId) {
        return { where: { registeredBranchId: staff.branchId }, branchId: staff.branchId };
      }
      return { where: { registeredHospitalId: hospitalId }, hospitalId };
    }
    if (role === "PATIENT") {
      return "SELF";
    }
    // DOCTOR (ASSIGNED) — no Appointment/Consultation data exists yet
    // (Phase 7), so this deliberately returns nothing rather than
    // approximating with a broader scope. See docs/18-MULTI-TENANCY.md.
    return "NONE";
  }

  private deliverActivationLink(userId: string, identifier: string, activationToken: string): void {
    this.logger.warn(`[DEV ONLY] Activation link for ${maskIdentifier(identifier)}: token=${activationToken}`);
    if (process.env.NODE_ENV !== "production") {
      this.lastActivationTokenByUserId.set(userId, activationToken);
    }
  }

  /** Test-only accessor — see deliverActivationLink(). */
  getLastActivationTokenForTesting(userId: string): string | undefined {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    return this.lastActivationTokenByUserId.get(userId);
  }
}
