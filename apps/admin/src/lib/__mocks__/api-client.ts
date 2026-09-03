// Manual mock for "@/lib/api-client" — auto-applied by `jest.mock("@/lib/api-client")`
// with no factory. Needed because the real module's top-level
// `NEXT_PUBLIC_API_BASE_URL` check throws in the Jest environment, and
// screen tests need `ApiError` as a real class (components do
// `error instanceof ApiError`) without ever loading the real module.
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
