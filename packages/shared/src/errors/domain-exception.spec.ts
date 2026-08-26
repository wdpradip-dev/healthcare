import { DomainException } from "./domain-exception";

describe("DomainException", () => {
  it("resolves the correct HTTP status from the error code registry", () => {
    const exception = new DomainException(
      "APPOINTMENT_CONFLICT",
      "This slot is no longer available.",
    );
    expect(exception.code).toBe("APPOINTMENT_CONFLICT");
    expect(exception.httpStatus).toBe(409);
  });

  it("carries field-level details for VALIDATION_ERROR", () => {
    const exception = new DomainException("VALIDATION_ERROR", "Invalid input.", [
      { field: "email", message: "Must be a valid email address." },
    ]);
    expect(exception.details).toHaveLength(1);
    expect(exception.httpStatus).toBe(400);
  });
});
