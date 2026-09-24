import type { AiSummary } from "@/lib/resources";

/**
 * docs/27-MEDICAL-AI-SAFETY.md "Labeling requirement": the AI text is only ever
 * rendered *inside* this component, which always carries its provenance label —
 * there is deliberately no prop to hide or dismiss it.
 */
export function AiSummaryBlock({ summary }: { summary: AiSummary }) {
  return (
    <section aria-label="AI-assisted summary" className="flex flex-col gap-1 rounded border border-tertiary/40 bg-tertiary/5 p-3">
      <p className="text-sm font-semibold text-tertiary">
        🤖 AI-Assisted Summary — {summary.reviewedBy ? `reviewed by ${summary.reviewedBy}` : "not yet reviewed by a doctor"}
      </p>
      <p className="text-sm text-on-surface">{summary.text}</p>
    </section>
  );
}
