import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { TextField } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { departmentsApi } from "@/lib/resources";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Search Departments". Doctor counts shown
 * in the mockup aren't returned by `GET /departments` and are omitted rather
 * than fabricated or requiring an N+1 fetch per row. */
export default function SearchDepartments() {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState("");

  const { data: departments, isLoading, isError } = useQuery({
    queryKey: ["departments", "search", query],
    queryFn: () => departmentsApi.search(accessToken!, { query: query || undefined }),
    enabled: Boolean(accessToken),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextField label="Search departments" value={query} onChangeText={setQuery} />
      </View>

      {isLoading ? <ActivityIndicator style={styles.spinner} color={lightColors.primary} /> : null}
      {isError ? <Text style={styles.error}>Couldn&apos;t load departments. Please try again.</Text> : null}
      {!isLoading && !isError && departments?.length === 0 ? <Text style={styles.empty}>No departments match your search.</Text> : null}

      <FlatList
        data={departments ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/departments/${item.id}`)} style={styles.card} accessibilityRole="button">
            <Text style={styles.cardTitle}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  header: { padding: 16, paddingBottom: 8 },
  spinner: { marginTop: 24 },
  error: { color: lightColors.error, textAlign: "center", marginTop: 24 },
  empty: { color: lightColors.onSurfaceVariant, textAlign: "center", marginTop: 24 },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 16, backgroundColor: lightColors.surface },
  cardTitle: { fontSize: 16, fontWeight: "700", color: lightColors.onSurface },
});
