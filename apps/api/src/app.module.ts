import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { JwtCommonModule } from "./common/jwt/jwt-common.module";
import { AuditModule } from "./audit/audit.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./auth/auth.module";
import { HospitalsModule } from "./hospitals/hospitals.module";
import { BranchesModule } from "./branches/branches.module";
import { DepartmentsModule } from "./departments/departments.module";
import { UsersModule } from "./users/users.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { PatientsModule } from "./patients/patients.module";
import { StaffModule } from "./staff/staff.module";
import { SchedulesModule } from "./schedules/schedules.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { ConsultationsModule } from "./consultations/consultations.module";

/**
 * Root module. Domain feature modules (patients, doctors, appointments, ...)
 * are registered here as they're built — one per API domain in
 * docs/15-API-SPECIFICATION.md, starting Phase 4 (docs/40-ROADMAP.md).
 * Cross-cutting infrastructure (config, database, JWT, audit, the global
 * guard/filter chain) is registered first since everything else depends on it.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    JwtCommonModule,
    AuditModule,
    CommonModule,
    AuthModule,
    HospitalsModule,
    BranchesModule,
    DepartmentsModule,
    UsersModule,
    DoctorsModule,
    PatientsModule,
    StaffModule,
    SchedulesModule,
    AppointmentsModule,
    ConsultationsModule,
    HealthModule,
  ],
})
export class AppModule {}
