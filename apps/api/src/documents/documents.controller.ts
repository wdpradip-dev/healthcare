import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  idParamSchema,
  listDocumentsQuerySchema,
  uploadDocumentFieldsSchema,
  type ListDocumentsQuery,
  type UploadDocumentFields,
} from "@hospital/validation";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { RequestUser } from "../common/types/request-user";
import { MAX_UPLOAD_BYTES } from "../storage/upload.util";
import { DocumentsService, type DocumentView } from "./documents.service";

/** docs/15-API-SPECIFICATION.md "/documents". Audit rows (DOCUMENT_*) are written by the service. */
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermission("documents.read")
  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery): Promise<DocumentView[]> {
    return this.documentsService.list(actor, query);
  }

  // +1 so an oversized file reaches validateUpload and gets the FILE_TOO_LARGE domain error rather than multer's own.
  @RequirePermission("documents.upload")
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }))
  upload(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(uploadDocumentFieldsSchema)) body: UploadDocumentFields,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DocumentView> {
    return this.documentsService.upload(actor, body, file);
  }

  @RequirePermission("documents.read")
  @Get(":id")
  getById(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<DocumentView> {
    return this.documentsService.getById(actor, params.id);
  }

  @RequirePermission("documents.read")
  @Get(":id/download")
  download(@CurrentUser() actor: RequestUser, @Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.documentsService.getDownloadUrl(actor, params.id);
  }
}
