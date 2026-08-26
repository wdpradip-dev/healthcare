import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("SecurePass1");
    await expect(verifyPassword(hash, "SecurePass1")).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("SecurePass1");
    await expect(verifyPassword(hash, "WrongPassword1")).resolves.toBe(false);
  });

  it("never stores the plaintext password in the hash output", async () => {
    const hash = await hashPassword("SecurePass1");
    expect(hash).not.toContain("SecurePass1");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
