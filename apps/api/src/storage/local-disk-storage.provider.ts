import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainException, type SignedUrlOptions, type StorageProvider, type UploadOptions } from "@hospital/shared";

/**
 * Filesystem-backed `StorageProvider` for the no-Docker dev/test path (see
 * docs/33-ENVIRONMENT-VARIABLES.md): with no `OBJECT_STORAGE_ENDPOINT` there
 * is no MinIO to talk to. Signed URLs are HMAC tokens redeemed at
 * `GET /files/:token` — minted only after a permission check, short-lived,
 * and naming exactly one key.
 */
export class LocalDiskStorageProvider implements StorageProvider {
  constructor(
    private readonly rootDir: string,
    private readonly signingSecret: string,
    private readonly defaultTtlSeconds: number,
  ) {}

  async upload(options: UploadOptions): Promise<{ key: string }> {
    const target = this.resolve(options.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, options.body);
    await writeFile(`${target}.meta`, JSON.stringify({ contentType: options.contentType }));
    return { key: options.key };
  }

  async getSignedDownloadUrl(options: SignedUrlOptions): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? this.defaultTtlSeconds);
    const payload = Buffer.from(JSON.stringify({ k: options.key, e: expires })).toString("base64url");
    return `/api/v1/files/${payload}.${this.sign(payload)}`;
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
    await rm(`${target}.meta`, { force: true });
  }

  /** Redeems a token from `getSignedDownloadUrl`; tampering, expiry or a missing file are all NOT_FOUND. */
  async readForToken(token: string): Promise<{ body: Buffer; contentType: string }> {
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !safeEqual(signature, this.sign(payload))) {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
    let parsed: { k: string; e: number };
    try {
      parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { k: string; e: number };
    } catch {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
    if (typeof parsed.k !== "string" || typeof parsed.e !== "number" || parsed.e < Math.floor(Date.now() / 1000)) {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
    const target = this.resolve(parsed.k);
    try {
      const [body, meta] = await Promise.all([readFile(target), readFile(`${target}.meta`, "utf8")]);
      return { body, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.signingSecret).update(payload).digest("base64url");
  }

  /** Keys are server-generated, but are still never allowed to escape the root. */
  private resolve(key: string): string {
    const root = path.resolve(this.rootDir);
    const target = path.resolve(root, key);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new DomainException("NOT_FOUND", "File not found.");
    }
    return target;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
