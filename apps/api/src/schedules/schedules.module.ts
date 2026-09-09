import { Module } from "@nestjs/common";
import { SchedulesController } from "./schedules.controller";
import { AvailabilityService } from "./availability.service";
import { DoctorScheduleService } from "./doctor-schedule.service";
import { ScheduleExceptionService } from "./schedule-exception.service";

@Module({
  controllers: [SchedulesController],
  providers: [AvailabilityService, DoctorScheduleService, ScheduleExceptionService],
})
export class SchedulesModule {}
