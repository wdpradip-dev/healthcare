import { StyleSheet, Text, View } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import type { AiSummary } from "@/lib/resources";

/**
 * docs/27-MEDICAL-AI-SAFETY.md "Labeling requirement": the AI text is only ever
 * rendered inside this component, which always carries its provenance label —
 * there is deliberately no prop to hide it.
 */
export function AiSummaryBlock({ summary }: { summary: AiSummary }) {
  return (
    <View style={styles.box} accessibilityLabel="AI-assisted summary">
      <Text style={styles.label}>
        🤖 AI-Assisted Summary — {summary.reviewedBy ? `reviewed by ${summary.reviewedBy}` : "pending doctor review"}
      </Text>
      <Text style={styles.text}>{summary.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.tertiary, padding: 14, gap: 4 },
  label: { fontSize: 13, fontWeight: "700", color: lightColors.tertiary },
  text: { fontSize: 14, color: lightColors.onSurface },
});
