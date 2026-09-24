import { Module } from "@nestjs/common";
import { SchedulesModule } from "../schedules/schedules.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AppointmentTransitionsService } from "./appointment-transitions.service";
import { NotificationStubService } from "./notification-stub.service";

@Module({
  imports: [SchedulesModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentTransitionsService, NotificationStubService],
  exports: [NotificationStubService],
})
export class AppointmentsModule {}
