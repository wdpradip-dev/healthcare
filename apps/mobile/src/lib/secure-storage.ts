import * as SecureStore from "expo-secure-store";

/**
 * Refresh-token storage per docs/16-AUTHENTICATION.md: Expo SecureStore
 * (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android).
 * The access token is never persisted here — it stays in memory only (see
 * auth-context.tsx) and is re-derived from this refresh token on cold start.
 */
const REFRESH_TOKEN_KEY = "hp_mobile_refresh_token";

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
