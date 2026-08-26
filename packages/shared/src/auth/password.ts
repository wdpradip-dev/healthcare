import argon2 from "argon2";

/**
 * Password hashing — argon2id per docs/25-SECURITY.md. Shared between the
 * Super Admin bootstrap script (packages/database/seed) and the auth module
 * (apps/api, Phase 3) so there is exactly one implementation, never two that
 * could drift.
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return argon2.hash(plainTextPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plainTextPassword: string): Promise<boolean> {
  return argon2.verify(hash, plainTextPassword);
}
