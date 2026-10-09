/**
 * Delivery-channel provider abstractions — docs/22-NOTIFICATIONS.md "Channels".
 * No domain code imports a vendor SDK/HTTP client directly, only these
 * interfaces, matching the `AiReportAssistProvider`/`StorageProvider`
 * pattern already established (packages/shared/src/ai, object-storage).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text is always safe; a provider that wants HTML may render it from this. */
  body: string;
}

export interface EmailProvider {
  /** False when no credentials/endpoint are configured — email delivery is then simply skipped. */
  readonly isConfigured: boolean;
  send(message: EmailMessage): Promise<boolean>;
}

export interface PushMessage {
  /** Expo push token. */
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly isConfigured: boolean;
  send(message: PushMessage): Promise<boolean>;
}

export interface SmsMessage {
  to: string;
  body: string;
}

/** Post-MVP (docs/22): the interface exists so the delivery pipeline is
 * already SMS-shaped, but no concrete provider is wired — `isConfigured` is
 * always false until one is. */
export interface SmsProvider {
  readonly isConfigured: boolean;
  send(message: SmsMessage): Promise<boolean>;
}
