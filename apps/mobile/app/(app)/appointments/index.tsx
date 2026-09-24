import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { appointmentsApi, type AppointmentRow } from "@/lib/resources";

const NON_TERMINAL = new Set(["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"]);

const STATUS_LABELS: Record<AppointmentRow["status"], string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked In",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * docs/08-MOBILE-DESIGN-MOCKUPS.md "Upcoming Appointments" / "Appointment
 * History" — the mockup's `status=upcoming`/`status=past` aren't real
 * `Appointment.status` values (docs/13-DATABASE-DESIGN.md's enum has no
 * "upcoming"/"past"), so the split is done client-side over the patient's
 * own full list instead of sending an unsupported filter value.
 */
export default function Appointments() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");

  const { data: appointments, isLoading, isError } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => appointmentsApi.list(accessToken!),
    enabled: Boolean(accessToken),
  });

  const upcoming = (appointments ?? [])
    .filter((a) => NON_TERMINAL.has(a.status))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const history = (appointments ?? [])
    .filter((a) => !NON_TERMINAL.has(a.status))
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
  const rows = tab === "upcoming" ? upcoming : history;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Appointments</Text>
        <View style={styles.segmented}>
          <Pressable onPress={() => setTab("upcoming")} style={[styles.segment, tab === "upcoming" && styles.segmentActive]}>
            <Text style={[styles.segmentLabel, tab === "upcoming" && styles.segmentLabelActive]}>Upcoming</Text>
          </Pressable>
          <Pressable onPress={() => setTab("history")} style={[styles.segment, tab === "history" && styles.segmentActive]}>
            <Text style={[styles.segmentLabel, tab === "history" && styles.segmentLabelActive]}>History</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}
      {isError ? <Text style={styles.error}>Couldn&apos;t load appointments. Please try again.</Text> : null}
      {!isLoading && !isError && rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}</Text>
          {tab === "upcoming" ? <Button label="Book Appointment" onPress={() => router.push("/doctors")} /> : null}
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/appointments/${item.id}`)} style={styles.card} accessibilityRole="button">
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.doctor.user.name}</Text>
              <Text style={styles.cardStatus}>{STATUS_LABELS[item.status]}</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              {item.department?.name ? `${item.department.name} · ` : ""}
              {formatDateTime(item.startTime)}
            </Text>
          </Pressable>
        )}
      />

      {tab === "upcoming" && rows.length > 0 ? (
        <View style={styles.fab}>
          <Button label="+ Book Appointment" onPress={() => router.push("/doctors")} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: lightColors.onSurface },
  segmented: { flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: lightColors.outline, overflow: "hidden" },
  segment: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentActive: { backgroundColor: lightColors.primary },
  segmentLabel: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
  segmentLabelActive: { color: lightColors.onPrimary },
  spinner: { marginTop: 24 },
  error: { color: lightColors.error, textAlign: "center", marginTop: 24 },
  empty: { alignItems: "center", gap: 12, marginTop: 24, paddingHorizontal: 24 },
  emptyText: { color: lightColors.onSurfaceVariant },
  list: { padding: 16, paddingTop: 0, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 16, backgroundColor: lightColors.surface, gap: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: lightColors.onSurface },
  cardStatus: { fontSize: 12, fontWeight: "600", color: lightColors.primary },
  cardSubtitle: { fontSize: 14, color: lightColors.onSurfaceVariant },
  fab: { padding: 16 },
});
