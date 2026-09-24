import { Module } from "@nestjs/common";
import { SchedulesController } from "./schedules.controller";
import { AvailabilityService } from "./availability.service";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { ScheduleExceptionService } from "./schedule-exception.service";

@Module({
  controllers: [SchedulesController],
  providers: [AvailabilityService, DoctorScheduleService, ScheduleExceptionService],
  // AvailabilityService is reused by AppointmentsModule (Phase 7) to
  // re-validate a requested booking slot against the same computation
  // `GET /schedules/availability` uses — see appointments.service.ts.
  exports: [AvailabilityService],
})
export class SchedulesModule {}
