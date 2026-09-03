import { render } from "@testing-library/react";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

/** Renders with a fresh, retry-disabled QueryClient — used by every page test that calls a `useQuery`/`useMutation` hook. */
export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
}
