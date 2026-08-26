import { Test, type TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it("reports liveness as ok", () => {
    expect(controller.liveness()).toEqual({ status: "ok" });
  });

  it("reports readiness as ok with a dependency-check caveat", () => {
    const result = controller.readiness();
    expect(result.status).toBe("ok");
    expect(result.note).toContain("not yet wired");
  });
});
