import { Module } from "@nestjs/common";
import { PrescriptionsController } from "./prescriptions.controller";
import { PrescriptionsService } from "./prescriptions.service";

/** Prescriptions + formulary lookup (docs/41-TASKS.md Phase 9). */
@Module({
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
