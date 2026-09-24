import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DomainException } from "@hospital/shared";
import { sniffMime } from "./file-sniffer";
import { LocalDiskStorageProvider } from "./local-disk-storage.provider";
import { MockMalwareScanner } from "./malware-scanner";
import { buildStorageKey, MAX_UPLOAD_BYTES, validateUpload } from "./upload.util";
import { buildTextPdf } from "../prescriptions/prescription-pdf";

const PDF = Buffer.from("%PDF-1.4 body");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("x")]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof DomainException ? error.code : "OTHER";
  }
}

describe("sniffMime", () => {
  it("detects PDF, JPEG and PNG by magic bytes", () => {
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
  });

  it("rejects everything else, including executables and short buffers", () => {
    expect(sniffMime(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(sniffMime(Buffer.from("<html>"))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(Buffer.from("%PD"))).toBeNull();
  });
});

describe("validateUpload", () => {
  const scanner = new MockMalwareScanner();

  it("admits a real file and reports the sniffed type, ignoring the extension", async () => {
    const result = await validateUpload({ originalname: "scan.exe", buffer: PDF }, scanner);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.sizeBytes).toBe(PDF.length);
  });

  it("requires a non-empty file", async () => {
    expect(await codeOf(validateUpload(undefined, scanner))).toBe("VALIDATION_ERROR");
    expect(await codeOf(validateUpload({ originalname: "a.pdf", buffer: Buffer.alloc(0) }, scanner))).toBe("VALIDATION_ERROR");
  });

  it("rejects an unsupported type and an oversized file", async () => {
    expect(await codeOf(validateUpload({ originalname: "a.pdf", buffer: Buffer.from("hello") }, scanner))).toBe("INVALID_FILE_TYPE");
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    big.write("%PDF-");
    expect(await codeOf(validateUpload({ originalname: "a.pdf", buffer: big }, scanner))).toBe("FILE_TOO_LARGE");
  });

  it("rejects a file the malware scanner flags", async () => {
    const infected = { scan: async () => ({ clean: false }) };
    expect(await codeOf(validateUpload({ originalname: "a.pdf", buffer: PDF }, infected))).toBe("INVALID_FILE_TYPE");
  });

  it("strips path components and odd characters from the display name", async () => {
    const result = await validateUpload({ originalname: "..\\..\\evil/na<me>.pdf", buffer: PDF }, scanner);
    expect(result.fileName).toBe("na_me_.pdf");
  });
});

describe("buildStorageKey", () => {
  it("namespaces by hospital and entity type and never repeats", () => {
    const a = buildStorageKey("h1", "report");
    expect(a.startsWith("h1/report/")).toBe(true);
    expect(buildStorageKey("h1", "report")).not.toBe(a);
    expect(buildStorageKey(null, "document").startsWith("platform/document/")).toBe(true);
  });
});

describe("LocalDiskStorageProvider", () => {
  let dir: string;
  let provider: LocalDiskStorageProvider;
  const tokenOf = (url: string) => url.replace("/api/v1/files/", "");

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "storage-spec-"));
    provider = new LocalDiskStorageProvider(dir, "secret-a", 600);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a file through a signed token", async () => {
    await provider.upload({ key: "h/report/1", contentType: "application/pdf", body: PDF });
    const url = await provider.getSignedDownloadUrl({ key: "h/report/1" });
    const { body, contentType } = await provider.readForToken(tokenOf(url));
    expect(body.equals(PDF)).toBe(true);
    expect(contentType).toBe("application/pdf");
  });

  it("rejects a tampered signature, a forged payload and a token signed with another secret", async () => {
    await provider.upload({ key: "h/report/1", contentType: "application/pdf", body: PDF });
    const token = tokenOf(await provider.getSignedDownloadUrl({ key: "h/report/1" }));
    const [payload, signature] = token.split(".");

    expect(await codeOf(provider.readForToken(`${payload}.${signature}x`))).toBe("NOT_FOUND");
    const forged = Buffer.from(JSON.stringify({ k: "h/report/2", e: 9_999_999_999 })).toString("base64url");
    expect(await codeOf(provider.readForToken(`${forged}.${signature}`))).toBe("NOT_FOUND");
    const other = new LocalDiskStorageProvider(dir, "secret-b", 600);
    expect(await codeOf(other.readForToken(token))).toBe("NOT_FOUND");
    expect(await codeOf(provider.readForToken("garbage"))).toBe("NOT_FOUND");
  });

  it("rejects an expired token", async () => {
    await provider.upload({ key: "h/report/1", contentType: "application/pdf", body: PDF });
    const token = tokenOf(await provider.getSignedDownloadUrl({ key: "h/report/1", expiresInSeconds: -10 }));
    expect(await codeOf(provider.readForToken(token))).toBe("NOT_FOUND");
  });

  it("refuses a key that escapes the storage root", async () => {
    expect(await codeOf(provider.upload({ key: "../escape", contentType: "application/pdf", body: PDF }))).toBe("NOT_FOUND");
  });

  it("deletes a file, after which its token no longer resolves", async () => {
    await provider.upload({ key: "h/report/1", contentType: "application/pdf", body: PDF });
    const token = tokenOf(await provider.getSignedDownloadUrl({ key: "h/report/1" }));
    await provider.delete("h/report/1");
    expect(await codeOf(provider.readForToken(token))).toBe("NOT_FOUND");
  });
});

describe("buildTextPdf", () => {
  it("produces a PDF that the upload sniffer accepts, escaping parentheses and non-ASCII", () => {
    const pdf = buildTextPdf(["Patient: A (B)", "Dose: 5 µg"]);
    expect(sniffMime(pdf)).toBe("application/pdf");
    const text = pdf.toString("latin1");
    expect(text).toContain("A \\(B\\)");
    expect(text).toContain("5 ?g");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("paginates long content", () => {
    const pdf = buildTextPdf(Array.from({ length: 120 }, (_, i) => `line ${i}`));
    expect(pdf.toString("latin1")).toMatch(/\/Count [2-9]/);
  });
});
