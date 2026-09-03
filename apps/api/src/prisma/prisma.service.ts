import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient, type ExtendedPrismaClient } from "@hospital/database";

/**
 * Injectable wrapper around the soft-delete-aware Prisma Client
 * (`@hospital/database`'s `createPrismaClient()`). No other file in
 * `apps/api` should call `new PrismaClient()` directly — see
 * docs/13-DATABASE-DESIGN.md's soft-delete convention and
 * packages/database/src/client.ts.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: ExtendedPrismaClient = createPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
