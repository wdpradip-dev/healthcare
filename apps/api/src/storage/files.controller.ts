import { Controller, Get, Header, Inject, Param, StreamableFile } from "@nestjs/common";
import { DomainException, type StorageProvider } from "@hospital/shared";
import { Public } from "../common/decorators/public.decorator";
import { LocalDiskStorageProvider } from "./local-disk-storage.provider";
import { STORAGE_PROVIDER } from "./storage.tokens";

/**
 * Redeems a local-disk signed-download token (`LocalDiskStorageProvider`).
 * `@Public` because the HMAC token *is* the authorization — it is only ever
 * minted by a route that already checked the caller's permission, expires in
 * minutes, and names one key. With an S3-compatible store configured this
 * route has nothing to serve and 404s.
 */
@Controller("files")
export class FilesController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Public()
  @Get(":token")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async download(@Param("token") token: string): Promise<StreamableFile> {
    if (!(this.storage instanceof LocalDiskStorageProvider)) {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
    const { body, contentType } = await this.storage.readForToken(token);
    return new StreamableFile(body, { type: contentType, disposition: "inline" });
  }
}
