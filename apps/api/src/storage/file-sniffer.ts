export type SniffedMime = "application/pdf" | "image/jpeg" | "image/png";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Magic-byte MIME detection (docs/21: never trust the client-declared
 * Content-Type) — the actual defense against INVALID_FILE_TYPE bypass, since
 * the declared type and file extension are attacker-controlled.
 */
export function sniffMime(buffer: Buffer): SniffedMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  return null;
}
