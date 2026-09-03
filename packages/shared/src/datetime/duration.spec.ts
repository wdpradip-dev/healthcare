import { parseDurationToMs } from "./duration";

describe("parseDurationToMs", () => {
  it.each([
    ["15m", 15 * 60_000],
    ["30d", 30 * 86_400_000],
    ["7d", 7 * 86_400_000],
    ["1h", 3_600_000],
    ["45s", 45_000],
  ])("parses %s to %i ms", (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it("throws on an unrecognized format", () => {
    expect(() => parseDurationToMs("15 minutes")).toThrow();
  });
});
