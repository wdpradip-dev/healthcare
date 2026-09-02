import { Test, type TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";

describe("HealthController", () => {
  let controller: HealthController;
  let prisma: { client: { $queryRaw: jest.Mock } };

  beforeEach(async () => {
    prisma = { client: { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(HealthController);
  });

  it("reports liveness as ok", () => {
    expect(controller.liveness()).toEqual({ status: "ok" });
  });

  it("reports readiness as ok when the database responds", async () => {
    const result = await controller.readiness();
    expect(result).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("reports readiness as degraded when the database is unreachable", async () => {
    prisma.client.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const result = await controller.readiness();
    expect(result).toEqual({ status: "degraded", checks: { database: "unreachable" } });
  });
});
