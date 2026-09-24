import { randomUUID } from "node:crypto";
import { DomainException } from "@hospital/shared";
import type { MalwareScanner } from "./malware-scanner";
import { sniffMime, type SniffedMime } from "./file-sniffer";

/** docs/21: fixed 10MB limit in MVP. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface ValidatedUpload {
  buffer: Buffer;
  mimeType: SniffedMime;
  sizeBytes: number;
  /** Display name only — never used to build a storage path. */
  fileName: string;
}

/**
 * The one place an upload is admitted: present, within the size cap, of a real
 * PDF/JPEG/PNG by magic bytes (the declared Content-Type/extension are
 * ignored), and clean per the malware-scan hook. Runs before anything touches
 * storage or the database.
 */
export async function validateUpload(file: UploadedFile | undefined, scanner: MalwareScanner): Promise<ValidatedUpload> {
  if (!file || file.buffer.length === 0) {
    throw new DomainException("VALIDATION_ERROR", "One or more fields are invalid.", [{ field: "file", message: "A file is required." }]);
  }
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    throw new DomainException("FILE_TOO_LARGE", "The file exceeds the 10MB limit.");
  }
  const mimeType = sniffMime(file.buffer);
  if (!mimeType) {
    throw new DomainException("INVALID_FILE_TYPE", "Only PDF, JPEG and PNG files are accepted.");
  }
  const { clean } = await scanner.scan(file.buffer);
  if (!clean) {
    throw new DomainException("INVALID_FILE_TYPE", "This file failed the security scan.");
  }
  return { buffer: file.buffer, mimeType, sizeBytes: file.buffer.length, fileName: sanitizeFileName(file.originalname) };
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file";
}

/** Storage keys are namespaced by hospital and entity type (docs/21), never derived from user input. */
export function buildStorageKey(hospitalId: string | null, entityType: string): string {
  return `${hospitalId ?? "platform"}/${entityType}/${randomUUID()}`;
}
