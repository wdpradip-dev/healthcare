import { Pressable, StyleSheet, Text } from "react-native";
import { lightColors } from "@hospital/ui-tokens";
import type { DoctorSummary } from "@/lib/resources";

export function DoctorCard({ doctor, onPress }: { doctor: DoctorSummary; onPress: () => void }) {
  const departmentNames = doctor.doctorDepartments.map((dd) => dd.department.name).join(", ");
  return (
    <Pressable onPress={onPress} style={styles.card} accessibilityRole="button">
      <Text style={styles.cardTitle}>{doctor.user.name}</Text>
      {departmentNames ? <Text style={styles.cardSubtitle}>{departmentNames}</Text> : null}
      {doctor.yearsOfExperience != null ? <Text style={styles.cardMeta}>{doctor.yearsOfExperience} years experience</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 16, backgroundColor: lightColors.surface, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: lightColors.onSurface },
  cardSubtitle: { fontSize: 14, color: lightColors.onSurfaceVariant },
  cardMeta: { fontSize: 13, color: lightColors.onSurfaceVariant },
});
