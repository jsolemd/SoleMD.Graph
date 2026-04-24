/**
 * Dashboard route-group layout.
 *
 * Pass-through in step 2 of the orb-as-field-particles pivot — this file
 * exists so Next.js creates the shared segment boundary that binds `/`
 * (landing) and `/graph` (dashboard) under one persistent layout. The
 * shell contents (chrome, field canvas, Cosmograph canvas, panels) move
 * into this layout in step 3.
 *
 * With `cacheComponents: true` in next.config.ts, router.replace between
 * sibling routes under this group preserves the layout instance — the
 * step-6 scroll-to-graph transition relies on that persistence to swap
 * URL without remounting the WebGL context.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
