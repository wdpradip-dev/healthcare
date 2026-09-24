import type { AiReportAssistProvider, ReportAssistInput, ReportAssistResult } from "@hospital/shared";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = [
  "You summarize laboratory or imaging report results in plain language for a clinician to review.",
  "Describe only what the supplied values or findings show, and note anything outside its stated reference range.",
  "Never state or imply a diagnosis, cause, prognosis or treatment. Keep it under 120 words.",
].join(" ");

/**
 * The only file that knows Groq exists (ADR-012, docs/27). Feature-flagged by
 * `GROQ_API_KEY`; any failure — no key, timeout, HTTP error, empty answer —
 * yields `null`, which the report pipeline treats as "no AI stage".
 */
export class GroqReportAssistProvider implements AiReportAssistProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async summarize(input: ReportAssistInput): Promise<ReportAssistResult | null> {
    if (!this.apiKey) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${input.kind === "lab" ? "Lab test" : "Imaging study"}: ${input.title}\n${JSON.stringify(input.content)}` },
          ],
        }),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const summary = json.choices?.[0]?.message?.content?.trim();
      return summary ? { summary, provider: "groq", model: this.model } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
