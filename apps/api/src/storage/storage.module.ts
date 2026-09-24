import { Global, Module } from "@nestjs/common";
import type { StorageProvider } from "@hospital/shared";
import { AppConfigService } from "../config/config.service";
import { FilesController } from "./files.controller";
import { LocalDiskStorageProvider } from "./local-disk-storage.provider";
import { MockMalwareScanner } from "./malware-scanner";
import { S3StorageProvider } from "./s3-storage.provider";
import { MALWARE_SCANNER, STORAGE_PROVIDER } from "./storage.tokens";

/**
 * Chooses the storage implementation from config (docs/33): an
 * `OBJECT_STORAGE_ENDPOINT` means an S3-compatible store (MinIO in dev, Supabase
 * Storage in staging/production); without one, files live on local disk — the
 * no-Docker dev/test path, refused in production.
 */
export function createStorageProvider(config: AppConfigService): StorageProvider {
  const env = config.env;
  if (env.OBJECT_STORAGE_ENDPOINT) {
    if (!env.OBJECT_STORAGE_ACCESS_KEY_ID || !env.OBJECT_STORAGE_SECRET_ACCESS_KEY) {
      throw new Error("OBJECT_STORAGE_ACCESS_KEY_ID/SECRET_ACCESS_KEY are required when OBJECT_STORAGE_ENDPOINT is set.");
    }
    return new S3StorageProvider(env.OBJECT_STORAGE_BUCKET, env.OBJECT_STORAGE_SIGNED_URL_TTL, {
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    });
  }
  if (env.NODE_ENV === "production") {
    throw new Error("OBJECT_STORAGE_ENDPOINT is required in production — local-disk storage is dev/test only.");
  }
  const secret = env.OBJECT_STORAGE_SIGNING_SECRET ?? (env.NODE_ENV === "test" ? "test-signing-secret" : undefined);
  if (!secret) {
    throw new Error("OBJECT_STORAGE_SIGNING_SECRET is required for local-disk object storage.");
  }
  return new LocalDiskStorageProvider(env.OBJECT_STORAGE_LOCAL_DIR, secret, env.OBJECT_STORAGE_SIGNED_URL_TTL);
}

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    { provide: STORAGE_PROVIDER, useFactory: createStorageProvider, inject: [AppConfigService] },
    { provide: MALWARE_SCANNER, useClass: MockMalwareScanner },
  ],
  exports: [STORAGE_PROVIDER, MALWARE_SCANNER],
})
export class StorageModule {}
