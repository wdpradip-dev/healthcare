import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

/**
 * Root module. Domain feature modules (auth, patients, doctors, appointments, ...)
 * are registered here as they're built — one per API domain in
 * docs/15-API-SPECIFICATION.md, starting Phase 3 (docs/40-ROADMAP.md).
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
