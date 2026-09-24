import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { RenderOptions, RenderResult } from "@testing-library/react-native";

/** Renders with a fresh, retry-disabled QueryClient — used by every screen
 * test that calls a `useQuery`/`useMutation` hook. Mirrors apps/admin's
 * identically-named helper. */
export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
}
