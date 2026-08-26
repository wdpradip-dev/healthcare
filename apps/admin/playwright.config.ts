import { defineConfig, devices } from "@playwright/test";

/**
 * Admin console E2E config — see docs/30-TESTING-STRATEGY.md and
 * docs/31-E2E-TEST-CASES.md for the case list. Run locally before every deploy
 * per docs/32-DEPLOYMENT.md (no hosted CI, ADR-011). Empty `e2e/` in Phase 1 —
 * cases are added alongside the flows they cover, starting Phase 3.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
