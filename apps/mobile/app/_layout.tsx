import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

/**
 * Root layout. Real navigation structure (Auth Stack / Main Tabs — see
 * docs/05-MOBILE-APP-SPECIFICATION.md "Information architecture") is added in
 * Phase 3/13 once auth exists. This is a Phase 1 scaffold placeholder.
 */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
