import { PERMISSIONS, isPermission } from "./permissions";

describe("permissions catalog", () => {
  it("has no duplicate entries", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("only contains lowercase resource.action strings", () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("recognizes a known permission and rejects an unknown one", () => {
    expect(isPermission("patients.read")).toBe(true);
    expect(isPermission("patients.delete")).toBe(false);
  });
});
