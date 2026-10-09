import type { SmsProvider } from "@hospital/shared";

/** docs/22: SMS is Post-MVP — the interface exists, no provider is wired. Always unconfigured. */
export class UnconfiguredSmsProvider implements SmsProvider {
  readonly isConfigured = false;

  async send(): Promise<boolean> {
    return false;
  }
}
