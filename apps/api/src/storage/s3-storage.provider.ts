import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SignedUrlOptions, StorageProvider, UploadOptions } from "@hospital/shared";

/**
 * S3-compatible `StorageProvider` — MinIO in dev (docker-compose) and Supabase
 * Storage's S3 endpoint in staging/production share this one implementation
 * (docs/33-ENVIRONMENT-VARIABLES.md). Path-style addressing is required by both.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly defaultTtlSeconds: number,
    config: { endpoint: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(options: UploadOptions): Promise<{ key: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: options.key, Body: options.body, ContentType: options.contentType }));
    return { key: options.key };
  }

  getSignedDownloadUrl(options: SignedUrlOptions): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: options.key }), {
      expiresIn: options.expiresInSeconds ?? this.defaultTtlSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
