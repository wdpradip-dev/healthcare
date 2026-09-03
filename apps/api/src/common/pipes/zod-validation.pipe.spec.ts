import { z } from "zod";
import { DomainException } from "@hospital/shared";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({ email: z.string().email(), age: z.number().min(0) });
  const pipe = new ZodValidationPipe(schema);

  it("returns the parsed value when valid", () => {
    const result = pipe.transform({ email: "a@b.com", age: 30 });
    expect(result).toEqual({ email: "a@b.com", age: 30 });
  });

  it("throws a VALIDATION_ERROR DomainException with per-field details when invalid", () => {
    try {
      pipe.transform({ email: "not-an-email", age: -1 });
      fail("expected transform to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const domainError = error as DomainException;
      expect(domainError.code).toBe("VALIDATION_ERROR");
      expect(domainError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "email" }),
          expect.objectContaining({ field: "age" }),
        ]),
      );
    }
  });
});
