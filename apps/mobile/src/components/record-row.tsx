import { Pressable, StyleSheet, Text } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import type { MedicalRecordEntry } from "@/lib/resources";

export function RecordRow({ entry, onPress }: { entry: MedicalRecordEntry; onPress: () => void }) {
  const date = entry.date ? new Date(entry.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <Text style={styles.title}>
        {date} · Consultation · {entry.doctor.name}
      </Text>
      {entry.diagnoses.length > 0 ? <Text style={styles.sub}>Diagnosis: {entry.diagnoses.map((d) => d.description).join(", ")}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2, backgroundColor: lightColors.surface },
  title: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
  sub: { fontSize: 13, color: lightColors.onSurfaceVariant },
});
