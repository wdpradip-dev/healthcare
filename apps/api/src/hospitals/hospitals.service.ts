import { Injectable } from "@nestjs/common";
import { DomainException } from "@hospital/shared";
import type { CreateHospitalInput, ListHospitalsQuery, UpdateHospitalInput } from "@hospital/validation";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Super Admin only (docs/15-API-SPECIFICATION.md "/hospitals"), operating at
 * `PLATFORM` scope by definition — a Hospital has no parent tenant to scope
 * against, so there is no `hospitalId` filter to apply here (contrast with
 * every other module in this phase).
 */
@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListHospitalsQuery) {
    return this.prisma.client.hospital.findMany({
      where: {
        status: query.status,
        ...(query.query
          ? { OR: [{ name: { contains: query.query, mode: "insensitive" } }, { slug: { contains: query.query, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async getById(id: string) {
    const hospital = await this.prisma.client.hospital.findUnique({ where: { id } });
    if (!hospital) {
      throw new DomainException("NOT_FOUND", "Hospital not found.");
    }
    return hospital;
  }

  async create(input: CreateHospitalInput) {
    await this.assertSlugAvailable(input.slug);
    return this.prisma.client.hospital.create({ data: input });
  }

  async update(id: string, input: UpdateHospitalInput) {
    await this.getById(id);
    if (input.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }
    return this.prisma.client.hospital.update({ where: { id }, data: input });
  }

  private async assertSlugAvailable(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.client.hospital.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [
        { field: "slug", message: "This slug is already in use." },
      ]);
    }
  }
}
