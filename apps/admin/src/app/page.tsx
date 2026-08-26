/**
 * Placeholder root page — Phase 1 scaffold. The real entry point is the Login
 * screen (docs/09-ADMIN-DESIGN-MOCKUPS.md), added in Phase 3 (task T-310) once
 * auth exists. This page exists so `pnpm --filter admin dev` has something to render.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold text-on-surface">Hospital Platform — Admin Console</h1>
      <p className="text-on-surface-variant">
        Scaffold in progress. See docs/42-PROJECT-STATE.md for current status.
      </p>
    </main>
  );
}
