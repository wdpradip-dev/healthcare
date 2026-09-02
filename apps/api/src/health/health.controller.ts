import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Liveness/readiness probes for the load balancer/orchestrator, per
 * docs/35-MONITORING-AND-OBSERVABILITY.md. Deliberately outside the `/api/v1`
 * prefix and excluded from Swagger (infrastructure endpoints, not part of the
 * public API contract in docs/15-API-SPECIFICATION.md), and public (no
 * orchestrator health-checker carries a bearer token).
 *
 * `/health/ready` now checks real database connectivity (Phase 3, once
 * `packages/database` had a client to check). It still does not check the
 * job queue — that dependency doesn't exist until Phase 10.
 */
@ApiExcludeController()
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async readiness(): Promise<{ status: "ok" | "degraded"; checks: Record<string, "ok" | "unreachable"> }> {
    let database: "ok" | "unreachable" = "ok";
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      database = "unreachable";
    }

    return {
      status: database === "ok" ? "ok" : "degraded",
      checks: { database },
    };
  }
}
