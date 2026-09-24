import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { resolveFileUrl } from "@/lib/api-client";
import { reportsApi } from "@/lib/resources";
import { AiSummaryBlock } from "@/components/ai-summary-block";

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Report Details" — results plus, when present, the always-labeled AI summary. */
export default function ReportDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [fileError, setFileError] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["report", id],
    queryFn: () => reportsApi.getById(accessToken!, id),
    enabled: Boolean(accessToken) && Boolean(id),
  });
  const file = useMutation({
    mutationFn: () => reportsApi.fileUrl(accessToken!, id),
    onSuccess: ({ url }) => {
      setFileError(false);
      void Linking.openURL(resolveFileUrl(url));
    },
    onError: () => setFileError(true),
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
        <Text style={styles.error}>This report could not be found.</Text>
      </View>
    );
  }

  const values = data.structuredValues ? Object.entries(data.structuredValues) : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{data.title}</Text>
      {data.verifiedByName ? <Text style={styles.muted}>Reviewed by {data.verifiedByName}</Text> : null}

      {values.map(([name, v]) => (
        <View key={name} style={styles.card}>
          <Text style={styles.name}>{name}</Text>
          <Text style={v.flag && v.flag !== "NORMAL" ? styles.abnormal : styles.body}>
            {v.value} {v.unit ?? ""}
            {v.flag && v.flag !== "NORMAL" ? ` — ${v.flag}` : ""}
          </Text>
          {v.referenceRange ? <Text style={styles.muted}>Reference: {v.referenceRange}</Text> : null}
        </View>
      ))}
      {data.findings ? <Text style={styles.body}>{data.findings}</Text> : null}

      {data.aiSummary ? <AiSummaryBlock summary={data.aiSummary} /> : null}

      {fileError ? <Text style={styles.error}>Couldn&apos;t open the file. Please try again.</Text> : null}
      <Button label="View original file" variant="secondary" loading={file.isPending} onPress={() => file.mutate()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  muted: { fontSize: 13, color: lightColors.onSurfaceVariant },
  card: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2 },
  name: { fontSize: 15, fontWeight: "600", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  abnormal: { fontSize: 14, fontWeight: "700", color: lightColors.error },
  error: { fontSize: 14, color: lightColors.error },
});
