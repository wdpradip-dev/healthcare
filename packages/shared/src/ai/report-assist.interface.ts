/**
 * AI report-assist abstraction — docs/27-MEDICAL-AI-SAFETY.md. No domain code
 * imports a provider SDK/HTTP client directly; the report pipeline only sees
 * this interface, so swapping Groq for anything else touches one file.
 *
 * Only the structured result values (or imaging findings text) are ever
 * passed in — never a patient name, DOB, contact details or history.
 */
export interface ReportAssistInput {
  kind: "lab" | "imaging";
  /** Test/study name, e.g. "Complete Blood Count". */
  title: string;
  /** Lab: the structured values object. Imaging: the findings text. */
  content: unknown;
}

export interface ReportAssistResult {
  /** Advisory plain-language summary — never a diagnosis. */
  summary: string;
  provider: string;
  model: string;
}

export interface AiReportAssistProvider {
  /** False when no credentials are configured — AI assist is then simply absent. */
  readonly isConfigured: boolean;
  /**
   * `null` = unavailable, timed out or unusable. Callers must treat that as
   * "no AI stage" (docs/27 "Failure behavior") — never as an error that
   * blocks the report, and never substitute a fallback guess.
   */
  summarize(input: ReportAssistInput): Promise<ReportAssistResult | null>;
}
