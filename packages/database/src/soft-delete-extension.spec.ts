import { applyFilter } from "./soft-delete-extension";

type Args = { where?: Record<string, unknown> };

describe("soft-delete applyFilter", () => {
  it("adds deletedAt: null for a soft-deletable model with no existing where", () => {
    const result = applyFilter<Args>("Patient", {});
    expect(result.where).toEqual({ deletedAt: null });
  });

  it("merges deletedAt: null alongside existing where conditions", () => {
    const result = applyFilter("Doctor", { where: { hospitalId: "h1" } });
    expect(result.where).toEqual({ hospitalId: "h1", deletedAt: null });
  });

  it("does not override an explicit deletedAt condition from the caller", () => {
    const result = applyFilter("User", { where: { deletedAt: { not: null } } });
    expect(result.where).toEqual({ deletedAt: { not: null } });
  });

  it("leaves models with no deletedAt column untouched", () => {
    const result = applyFilter("Prescription", { where: { status: "ACTIVE" } });
    expect(result.where).toEqual({ status: "ACTIVE" });
  });

  it("does not add a where clause at all for non-soft-deletable models with none given", () => {
    const result = applyFilter<Args>("AuditLog", {});
    expect(result.where).toBeUndefined();
  });
});
