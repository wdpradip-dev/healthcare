import { Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "@hospital/shared";

/**
 * docs/22-NOTIFICATIONS.md deliberately doesn't name an email vendor
 * ("provider-agnostic interface") — this POSTs the shape most transactional
 * email APIs already accept (`{from, to, subject, html}` with a Bearer
 * token); point `EMAIL_PROVIDER_ENDPOINT` at a vendor whose API matches, or
 * adapt this one file if it doesn't. Untested against a live vendor in this
 * environment (docs/42-PROJECT-STATE.md known issues), same caveat as
 * `S3StorageProvider`.
 */
export class HttpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(HttpEmailProvider.name);

  constructor(
    private readonly endpoint: string | undefined,
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.endpoint);
  }

  async send(message: EmailMessage): Promise<boolean> {
    if (!this.endpoint) {
      this.logger.warn(`[NO PROVIDER] Email to ${message.to}: ${message.subject}`);
      return false;
    }
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ from: this.fromAddress, to: message.to, subject: message.subject, html: message.body }),
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(`Email delivery failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
