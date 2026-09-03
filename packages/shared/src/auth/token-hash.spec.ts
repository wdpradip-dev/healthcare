import { generateOpaqueToken, hashOpaqueToken } from "./token-hash";

describe("opaque token generation and hashing", () => {
  it("generates a high-entropy, URL-safe token", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThan(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates distinct tokens on each call", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  it("hashes deterministically — same input always produces the same hash", () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashOpaqueToken(generateOpaqueToken())).not.toBe(hashOpaqueToken(generateOpaqueToken()));
  });
});
