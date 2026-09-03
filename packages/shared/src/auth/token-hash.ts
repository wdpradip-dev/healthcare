import { createHash, randomBytes } from "node:crypto";

/**
 * Deterministic hashing for high-entropy opaque tokens (refresh tokens —
 * docs/16-AUTHENTICATION.md), NOT for passwords or OTP codes (see
 * `hashPassword`/`verifyPassword` in ./password.ts, which use argon2id
 * deliberately). A refresh token is a 256-bit random value the caller
 * presents directly for a database lookup ("find the row for this exact
 * token"), which argon2's salted, non-deterministic hashing structurally
 * cannot support — two hashes of the same input never match. SHA-256 is
 * appropriate here specifically because the input already has enough
 * entropy that a fast, unsalted hash isn't an offline-brute-force risk the
 * way it would be for a human-chosen password or a 6-digit OTP.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
