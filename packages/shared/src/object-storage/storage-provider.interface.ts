/**
 * Object storage abstraction — see docs/11-SYSTEM-ARCHITECTURE.md and
 * docs/21-REPORTS-AND-DOCUMENTS.md. Concrete implementations (local/MinIO for dev,
 * Supabase Storage for staging/production per ADR-011) are added in Phase 9
 * (docs/40-ROADMAP.md, task T-901) when the Document/Report modules first need them.
 * No domain code may import a storage SDK directly — only this interface.
 */
export interface UploadOptions {
  /** Storage key, namespaced by hospitalId/entity type/id — never a public path. */
  key: string;
  contentType: string;
  body: Buffer | Uint8Array;
}

export interface SignedUrlOptions {
  key: string;
  /** Seconds until the URL expires. Defaults to OBJECT_STORAGE_SIGNED_URL_TTL. */
  expiresInSeconds?: number;
}

export interface StorageProvider {
  upload(options: UploadOptions): Promise<{ key: string }>;
  getSignedDownloadUrl(options: SignedUrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
}
