// Manual mock for "@/lib/api-client" — auto-applied by `jest.mock("@/lib/api-client")`
// with no factory. Screen tests need `ApiError` as a real class (components
// do `error instanceof ApiError`) without ever loading the real module,
// since its top-level `EXPO_PUBLIC_API_BASE_URL` check reads a value that
// babel-preset-expo inlines at build/transform time, not from a runtime
// `process.env` a jest setup file can set.
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

export const apiFetch = jest.fn();
