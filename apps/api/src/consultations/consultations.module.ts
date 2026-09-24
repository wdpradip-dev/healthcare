import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ConsultationsController } from "./consultations.controller";
import { ConsultationsService } from "./consultations.service";
import { MedicalRecordsController } from "./medical-records.controller";
import { MedicalRecordsService } from "./medical-records.service";

/** Consultations + the longitudinal medical record (docs/41-TASKS.md Phase 8). */
@Module({
  imports: [AppointmentsModule],
  controllers: [ConsultationsController, MedicalRecordsController],
  providers: [ConsultationsService, MedicalRecordsService],
})
export class ConsultationsModule {}
