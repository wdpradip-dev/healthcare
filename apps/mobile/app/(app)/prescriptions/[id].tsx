import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { resolveFileUrl } from "@/lib/api-client";
import { prescriptionsApi } from "@/lib/resources";
import { medicationName } from "./index";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Prescription Details" — read-only, with the generated PDF. */
export default function PrescriptionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [pdfError, setPdfError] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["prescription", id],
    queryFn: () => prescriptionsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });
  const pdf = useMutation({
    mutationFn: () => prescriptionsApi.pdfUrl(accessToken!, id),
    onSuccess: ({ url }) => {
      setPdfError(false);
      void Linking.openURL(resolveFileUrl(url));
    },
    onError: () => setPdfError(true),
  });

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
        <Text style={styles.error}>This prescription could not be found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Prescription</Text>
      <Text style={styles.muted}>
        {data.doctor.user.name} · {new Date(data.issuedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </Text>
      {data.status !== "ACTIVE" ? <Text style={styles.muted}>This prescription has been replaced or has expired.</Text> : null}

      {data.items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{medicationName(item)}</Text>
          <Text style={styles.body}>
            {item.dosage} · {item.frequency}
            {item.durationDays ? ` · ${item.durationDays} days` : ""}
          </Text>
          {item.instructions ? <Text style={styles.muted}>{item.instructions}</Text> : null}
        </View>
      ))}

      {pdfError ? <Text style={styles.error}>Couldn&apos;t open the PDF. Please try again.</Text> : null}
      <Button label="Download PDF" variant="secondary" loading={pdf.isPending} onPress={() => pdf.mutate()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  muted: { fontSize: 14, color: lightColors.onSurfaceVariant },
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2 },
  name: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  error: { fontSize: 14, color: lightColors.error },
});
