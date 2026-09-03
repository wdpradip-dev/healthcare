import type { ErrorResponse } from "@hospital/validation";

/**
 * Thin fetch wrapper for calling the NestJS API (docs/15-API-SPECIFICATION.md).
 * Server-side only for now (Server Actions / Server Components) — Phase 3
 * only needs the unauthenticated auth endpoints and the `me`/session
 * endpoints, all of which are naturally called from server actions that
 * also need to read/write the httpOnly session cookies (see session.ts).
 * A client-side variant (for interactive dashboards using TanStack Query)
 * is added alongside the first module that needs it, starting Phase 4.
 */
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured — see docs/33-ENVIRONMENT-VARIABLES.md.");
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Platform": "WEB",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const json = (await response.json()) as { data?: T } & Partial<ErrorResponse>;

  if (!response.ok) {
    const error = json.error;
    throw new ApiError(error?.code ?? "INTERNAL_ERROR", error?.message ?? "Something went wrong.", error?.details);
  }

  // Auth endpoints currently return the payload directly (not wrapped in
  // `{ data }`) — see docs/37-API-EXAMPLES.md. Domain modules from Phase 4
  // onward follow the `{ data, meta }` envelope; this helper accommodates
  // both shapes rather than assuming one.
  return (json.data ?? (json as unknown as T)) as T;
}
