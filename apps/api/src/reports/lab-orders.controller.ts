import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  createLabOrderSchema,
  listLabOrdersQuerySchema,
  type CreateLabOrderInput,
  type ListLabOrdersQuery,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { LabOrdersService, type LabOrderDetail } from "./lab-orders.service";

/** docs/15-API-SPECIFICATION.md "/lab-orders". */
@Controller("lab-orders")
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @RequirePermission("lab_orders.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listLabOrdersQuerySchema)) query: ListLabOrdersQuery): Promise<LabOrderDetail[]> {
    return this.labOrdersService.list(actor, query);
  }

  @RequirePermission("lab_orders.write")
  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createLabOrderSchema)) body: CreateLabOrderInput): Promise<LabOrderDetail> {
    return this.labOrdersService.create(actor, body);
  }
}
