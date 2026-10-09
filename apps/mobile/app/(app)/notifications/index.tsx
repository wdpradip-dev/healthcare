import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { notificationsApi, type NotificationPreferences, type NotificationRow } from "@/lib/resources";

const CATEGORY_LABELS: { key: keyof NonNullable<NotificationPreferences["categories"]>; label: string }[] = [
  { key: "appointments", label: "Appointment reminders" },
  { key: "consultations", label: "Consultation summaries" },
  { key: "prescriptions", label: "Prescription alerts" },
  { key: "reports", label: "Report ready alerts" },
];

function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function destinationFor(n: NotificationRow): string | null {
  if (!n.relatedEntityType || !n.relatedEntityId) return null;
  if (n.relatedEntityType === "Appointment") return `/appointments/${n.relatedEntityId}`;
  if (n.relatedEntityType === "LabReport" || n.relatedEntityType === "ImagingReport") return `/reports/${n.relatedEntityId}`;
  if (n.relatedEntityType === "Prescription") return `/prescriptions/${n.relatedEntityId}`;
  return null;
}

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Notifications" + the preference toggles from "Settings"
 * (relocated here since a dedicated Settings screen is T-1301, not yet built). */
export default function Notifications() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(accessToken!),
    enabled: Boolean(accessToken),
  });
  const { data: preferences } = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: () => notificationsApi.preferences(accessToken!),
    enabled: Boolean(accessToken),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(accessToken!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(accessToken!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  // Optimistic + rollback on failure (docs/08 "Settings" interaction note).
  const updatePreferences = useMutation({
    mutationFn: (next: NotificationPreferences) => notificationsApi.updatePreferences(accessToken!, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", "preferences"] });
      const previous = queryClient.getQueryData<NotificationPreferences>(["notifications", "preferences"]);
      queryClient.setQueryData(["notifications", "preferences"], next);
      return { previous };
    },
    onError: (_err, _next, context) => queryClient.setQueryData(["notifications", "preferences"], context?.previous),
  });

  const onPress = (n: NotificationRow) => {
    if (!n.readAt) markRead.mutate(n.id);
    const destination = destinationFor(n);
    if (destination) router.push(destination as never);
  };

  const togglePush = (value: boolean) => updatePreferences.mutate({ ...preferences, push: value });
  const toggleEmail = (value: boolean) => updatePreferences.mutate({ ...preferences, email: value });
  const toggleCategory = (key: keyof NonNullable<NotificationPreferences["categories"]>, value: boolean) =>
    updatePreferences.mutate({ ...preferences, categories: { ...preferences?.categories, [key]: value } });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load your notifications. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {data.some((n) => !n.readAt) ? (
          <Pressable onPress={() => markAllRead.mutate()} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {data.length === 0 ? <Text style={styles.body}>You&apos;re all caught up.</Text> : null}
      {data.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => onPress(n)}
          accessibilityRole="button"
          accessibilityLabel={n.readAt ? n.title : `Unread, ${n.title}`}
          style={[styles.row, !n.readAt ? styles.unread : null]}
        >
          <Text style={styles.rowTitle}>{n.title}</Text>
          <Text style={styles.sub}>
            {n.body} · {timeAgo(n.createdAt)}
          </Text>
        </Pressable>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification preferences</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.body}>Push notifications</Text>
          <Switch value={preferences?.push ?? true} onValueChange={togglePush} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.body}>Email notifications</Text>
          <Switch value={preferences?.email ?? true} onValueChange={toggleEmail} />
        </View>
        {CATEGORY_LABELS.map(({ key, label }) => (
          <View key={key} style={styles.toggleRow}>
            <Text style={styles.body}>{label}</Text>
            <Switch value={preferences?.categories?.[key] ?? true} onValueChange={(v) => toggleCategory(key, v)} />
          </View>
        ))}
      </View>

      <Button label="Refresh" variant="secondary" onPress={() => void queryClient.invalidateQueries({ queryKey: ["notifications"] })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  markAll: { fontSize: 14, fontWeight: "600", color: lightColors.primary },
  body: { fontSize: 14, color: lightColors.onSurface },
  row: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2, backgroundColor: lightColors.surface },
  unread: { backgroundColor: lightColors.primaryContainer, borderColor: lightColors.primary },
  rowTitle: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
  sub: { fontSize: 13, color: lightColors.onSurfaceVariant },
  section: { gap: 8, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  error: { fontSize: 14, color: lightColors.error, textAlign: "center" },
});
