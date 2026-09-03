import { generateKeyPairSync } from "node:crypto";
import { AccessTokenService } from "./access-token.service";
import type { AppConfigService } from "../../config/config.service";

function makeConfig(overrides: Partial<AppConfigService["env"]> = {}): AppConfigService {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return {
    env: {
      JWT_PRIVATE_KEY: privateKey,
      JWT_PUBLIC_KEY: publicKey,
      JWT_ACCESS_TOKEN_TTL: "15m",
      ...overrides,
    },
  } as AppConfigService;
}

describe("AccessTokenService", () => {
  it("signs a token and verifies it back to the same claims", () => {
    const service = new AccessTokenService(makeConfig());
    const token = service.sign({
      sub: "user-1",
      hospitalId: "hosp-1",
      roles: ["PATIENT"],
      permissions: ["patients.read", "appointments.create"],
    });

    const decoded = service.verify(token);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.hospitalId).toBe("hosp-1");
    expect(decoded.roles).toEqual(["PATIENT"]);
    expect(decoded.permissions).toEqual(["patients.read", "appointments.create"]);
    expect(decoded.jti).toEqual(expect.any(String));
  });

  it("rejects a token signed with a different key pair", () => {
    const serviceA = new AccessTokenService(makeConfig());
    const serviceB = new AccessTokenService(makeConfig());
    const token = serviceA.sign({ sub: "user-1", hospitalId: null, roles: ["PATIENT"], permissions: [] });

    expect(() => serviceB.verify(token)).toThrow();
  });

  it("rejects an expired token", () => {
    const service = new AccessTokenService(makeConfig({ JWT_ACCESS_TOKEN_TTL: "1s" }));
    const token = service.sign({ sub: "user-1", hospitalId: null, roles: ["PATIENT"], permissions: [] });

    jest.useFakeTimers().setSystemTime(Date.now() + 2000);
    expect(() => service.verify(token)).toThrow();
    jest.useRealTimers();
  });
});
