import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getDocumentAsync } from "expo-document-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lightColors } from "@hospital/ui-tokens";
import { Button } from "@hospital/ui-native";
import { useAuth } from "@/lib/auth-context";
import { ApiError, resolveFileUrl } from "@/lib/api-client";
import { documentsApi } from "@/lib/resources";

const CATEGORY_LABELS = {
  REPORT_ATTACHMENT: "Report file",
  PRESCRIPTION_PDF: "Prescription PDF",
  ID_PROOF: "ID proof",
  INSURANCE: "Insurance",
  OTHER: "Other",
} as const;

/** docs/08-MOBILE-DESIGN-MOCKUPS.md "Documents" + "Document Viewer" — opening a document mints a short-lived signed URL. */
export default function Documents() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(accessToken!),
    enabled: Boolean(accessToken),
  });

  const open = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(accessToken!, id),
    onSuccess: ({ url }) => {
      setError(null);
      void Linking.openURL(resolveFileUrl(url));
    },
    onError: () => setError("Couldn't open the document. Please try again."),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return null;
      const form = new FormData();
      form.append("category", "OTHER");
      // React Native's FormData accepts a { uri, name, type } descriptor in place of a Blob.
      form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
      return documentsApi.upload(accessToken!, form);
    },
    onSuccess: (created) => {
      if (created) {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't upload the file. Please try again."),
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
        <Text style={styles.error}>Couldn&apos;t load your documents. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Documents</Text>
      <Button label="Upload a document" loading={upload.isPending} onPress={() => upload.mutate()} />
      <Text style={styles.muted}>PDF, JPEG or PNG, up to 10MB.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data.length === 0 ? <Text style={styles.body}>No documents yet.</Text> : null}
      {data.map((d) => (
        <Pressable key={d.id} style={styles.row} accessibilityRole="button" onPress={() => open.mutate(d.id)}>
          <Text style={styles.rowTitle}>{d.fileName}</Text>
          <Text style={styles.muted}>
            {CATEGORY_LABELS[d.category]} · {new Date(d.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: lightColors.background, padding: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightColors.background, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: lightColors.onSurface },
  body: { fontSize: 14, color: lightColors.onSurface },
  muted: { fontSize: 13, color: lightColors.onSurfaceVariant },
  row: { borderRadius: 12, borderWidth: 1, borderColor: lightColors.outline, padding: 14, gap: 2, backgroundColor: lightColors.surface },
  rowTitle: { fontSize: 14, fontWeight: "600", color: lightColors.onSurface },
  error: { fontSize: 14, color: lightColors.error },
});
