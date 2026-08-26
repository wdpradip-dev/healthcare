import type { ExpoConfig } from "expo/config";

/**
 * Expo config — see docs/05-MOBILE-APP-SPECIFICATION.md and docs/32-DEPLOYMENT.md
 * (EAS Build profiles: preview → Android APK, production → AAB).
 */
const config: ExpoConfig = {
  name: "Hospital Platform",
  slug: "hospital-platform",
  scheme: "hospitalplatform",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  // App icon / splash / adaptive-icon image assets are added once the design
  // system's brand mark exists as an exported asset (docs/07-DESIGN-SYSTEM.md);
  // omitted in the Phase 1 scaffold so Expo falls back to its defaults rather
  // than referencing files that don't exist yet.
  splash: {
    backgroundColor: "#FBFDFB",
  },
  android: {
    package: "com.hospitalplatform.app",
    adaptiveIcon: {
      backgroundColor: "#FBFDFB",
    },
  },
  plugins: ["expo-router", "expo-secure-store"],
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
