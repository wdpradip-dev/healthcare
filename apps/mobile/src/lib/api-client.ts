import { Platform } from "react-native";
import type { ErrorResponse } from "@hospital/validation";

/** Thin fetch wrapper for calling the NestJS API (docs/15-API-SPECIFICATION.md). */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured — see docs/33-ENVIRONMENT-VARIABLES.md.");
}

const CLIENT_PLATFORM = Platform.OS === "ios" ? "IOS" : "ANDROID";

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Platform": CLIENT_PLATFORM,
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await response.json()) as { data?: T } & Partial<ErrorResponse>;

  if (!response.ok) {
    const error = json.error;
    throw new ApiError(error?.code ?? "INTERNAL_ERROR", error?.message ?? "Something went wrong.", error?.details);
  }

  // See admin's api-client.ts for why both response shapes are accommodated.
  return (json.data ?? (json as unknown as T)) as T;
}

/** Multipart upload — no Content-Type header, so fetch sets the boundary itself. */
export async function apiUpload<T>(path: string, form: FormData, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "X-Client-Platform": CLIENT_PLATFORM, Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const json = (await response.json()) as { data?: T } & Partial<ErrorResponse>;
  if (!response.ok) {
    const error = json.error;
    throw new ApiError(error?.code ?? "INTERNAL_ERROR", error?.message ?? "Something went wrong.", error?.details);
  }
  return (json.data ?? (json as unknown as T)) as T;
}

/** A signed-download URL may be relative to the API origin (local-disk storage) or absolute (S3-compatible). */
export function resolveFileUrl(url: string): string {
  return url.startsWith("/") ? `${new URL(API_BASE_URL as string).origin}${url}` : url;
}
