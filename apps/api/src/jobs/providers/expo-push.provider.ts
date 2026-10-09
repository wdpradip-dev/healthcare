import { Logger } from "@nestjs/common";
import type { PushMessage, PushProvider } from "@hospital/shared";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** docs/22: Expo Push Notification service (wraps FCM/APNs). */
export class ExpoPushProvider implements PushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);

  constructor(private readonly accessToken: string | undefined) {}

  get isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  async send(message: PushMessage): Promise<boolean> {
    if (!this.accessToken) {
      this.logger.warn(`[NO PROVIDER] Push to ${message.token}: ${message.title}`);
      return false;
    }
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ to: message.token, title: message.title, body: message.body, data: message.data }),
      });
      if (!response.ok) return false;
      const json = (await response.json()) as { data?: { status?: string } };
      return json.data?.status === "ok";
    } catch (error) {
      this.logger.warn(`Push delivery failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
