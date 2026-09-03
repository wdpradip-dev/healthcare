const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a short duration string (`"15m"`, `"30d"`, `"7d"`, `"1h"`) — the
 * format used by the TTL environment variables in
 * docs/33-ENVIRONMENT-VARIABLES.md (`JWT_ACCESS_TOKEN_TTL`, etc.) — into
 * milliseconds.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration string "${duration}" — expected e.g. "15m", "7d".`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit as string]!;
}
