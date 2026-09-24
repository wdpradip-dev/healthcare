import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createReportFieldsSchema,
  idParamSchema,
  listReportsQuerySchema,
  updateReportSchema,
  verifyReportSchema,
  type CreateReportFields,
  type ListReportsQuery,
  type UpdateReportInput,
  type VerifyReportInput,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { MAX_UPLOAD_BYTES } from "../storage/upload.util";
import { ReportsService, type ReportView } from "./reports.service";

/** docs/15-API-SPECIFICATION.md "/reports". Audit rows (REPORT_*) are written by the service. */
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermission("reports.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listReportsQuerySchema)) query: ListReportsQuery): Promise<ReportView[]> {
    return this.reportsService.list(actor, query);
  }

  @RequirePermission("reports.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<ReportView> {
    return this.reportsService.getById(actor, params.id);
  }

  // +1 so an oversized file reaches validateUpload and gets the FILE_TOO_LARGE domain error rather than multer's own.
  @RequirePermission("reports.upload")
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }))
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createReportFieldsSchema)) body: CreateReportFields,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ReportView> {
    return this.reportsService.create(actor, body, file);
  }

  @RequirePermission("reports.upload")
  @Patch(":id")
  update(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateReportSchema)) body: UpdateReportInput,
  ): Promise<ReportView> {
    return this.reportsService.update(actor, params.id, body);
  }

  @RequirePermission("reports.upload")
  @Post(":id/analyze")
  analyze(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.reportsService.analyze(actor, params.id);
  }

  @RequirePermission("reports.verify")
  @Post(":id/verify")
  verify(
    @CurrentUser() actor: RequestUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(verifyReportSchema)) body: VerifyReportInput,
  ): Promise<ReportView> {
    return this.reportsService.verify(actor, params.id, body);
  }

  @RequirePermission("reports.read")
  @Get(":id/file")
  getFile(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.reportsService.getFileUrl(actor, params.id);
  }
}
