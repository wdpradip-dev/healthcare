import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors, UsePipes } from "@nestjs/common";
import {
  createHospitalSchema,
  idParamSchema,
  listHospitalsQuerySchema,
  updateHospitalSchema,
  type CreateHospitalInput,
  type ListHospitalsQuery,
  type UpdateHospitalInput,
} from "@hospital/validation";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { Audit } from "../audit/audit.decorator";
import { AuditInterceptor } from "../audit/audit.interceptor";
import { HospitalsService } from "./hospitals.service";

/** Super Admin only — docs/15-API-SPECIFICATION.md "/hospitals". */
@Controller("hospitals")
@UseInterceptors(AuditInterceptor)
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @RequirePermission("hospitals.read")
  @Get()
  @UsePipes(new ZodValidationPipe(listHospitalsQuerySchema))
  list(@Query() query: ListHospitalsQuery) {
    return this.hospitalsService.list(query);
  }

  @RequirePermission("hospitals.read")
  @Get(":id")
  @UsePipes(new ZodValidationPipe(idParamSchema))
  getById(@Param() params: { id: string }) {
    return this.hospitalsService.getById(params.id);
  }

  @RequirePermission("hospitals.write")
  @Post()
  @Audit({ action: "HOSPITAL_CREATE", resourceType: "Hospital" })
  @UsePipes(new ZodValidationPipe(createHospitalSchema))
  create(@Body() body: CreateHospitalInput) {
    return this.hospitalsService.create(body);
  }

  @RequirePermission("hospitals.write")
  @Patch(":id")
  @Audit({ action: "HOSPITAL_UPDATE", resourceType: "Hospital" })
  update(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }, @Body(new ZodValidationPipe(updateHospitalSchema)) body: UpdateHospitalInput) {
    return this.hospitalsService.update(params.id, body);
  }
}
