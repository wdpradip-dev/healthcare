import { z } from "zod";
import { loadEnv } from "./load-env";

describe("loadEnv", () => {
  const schema = z.object({
    FOO: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(4000),
  });

  it("returns parsed, typed values when the source satisfies the schema", () => {
    const result = loadEnv(schema, { FOO: "bar", PORT: "5000" });
    expect(result).toEqual({ FOO: "bar", PORT: 5000 });
  });

  it("applies schema defaults for missing optional variables", () => {
    const result = loadEnv(schema, { FOO: "bar" });
    expect(result.PORT).toBe(4000);
  });

  it("throws a single error listing every missing/invalid variable", () => {
    expect(() => loadEnv(schema, {})).toThrow(/FOO/);
  });
});
