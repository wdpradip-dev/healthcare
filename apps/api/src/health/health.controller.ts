import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

/**
 * Liveness/readiness probes for the load balancer/orchestrator, per
 * docs/35-MONITORING-AND-OBSERVABILITY.md. Deliberately outside the `/api/v1`
 * prefix and excluded from Swagger (infrastructure endpoints, not part of the
 * public API contract in docs/15-API-SPECIFICATION.md).
 *
 * `/health/ready` currently mirrors `/health` — it will actually check
 * database/queue reachability once those dependencies exist (packages/database
 * in Phase 2, the job queue in Phase 10). Until then it must not be read as
 * confirming those dependencies are healthy.
 */
@ApiExcludeController()
@Controller("health")
export class HealthController {
  @Get()
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  readiness(): { status: "ok"; note: string } {
    return {
      status: "ok",
      note: "Dependency checks (database, queue) not yet wired — see docs/42-PROJECT-STATE.md.",
    };
  }
}
