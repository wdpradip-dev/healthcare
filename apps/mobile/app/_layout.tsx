import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth-context";

/**
 * Root layout. The Auth Stack (Splash/Welcome/Login/Register/OTP/Forgot-Reset
 * Password) is wired up in Phase 3 (T-311); Main Tabs follow once Patient
 * Home exists (docs/05-MOBILE-APP-SPECIFICATION.md "Information architecture").
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
