import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";

/**
 * Root layout. The Auth Stack (Splash/Welcome/Login/Register/OTP/Forgot-Reset
 * Password) is wired up in Phase 3 (T-311). Phase 7 adds the `(app)` group —
 * a minimal authenticated shell (not the full Home/Profile/Settings dashboard,
 * which is T-1301/Phase 13) hosting doctor/department discovery and the
 * appointment booking + management screens (T-708-710).
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
