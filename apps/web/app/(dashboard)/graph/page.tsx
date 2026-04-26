import { connection } from "next/server";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { GraphSurfaceSwitch } from "@/features/graph/orb/GraphSurfaceSwitch";
import { GraphBundleUnavailable } from "@/features/graph/components/shell/GraphBundleUnavailable";

/**
 * /graph workspace.
 *
 * The 16384-particle field canvas is mounted in the (dashboard) layout
 * and stays live across navigations under Next 16's cacheComponents.
 * <GraphSurfaceSwitch> routes between the '3d' surface (OrbSurface —
 * paper identity on the field canvas, default) and the '2d' surface
 * (native Cosmograph via DashboardShell) based on
 * useDashboardStore.rendererMode.
 *
 * Both branches share the same dashboard store, graph store, shell
 * store, and bundle session — toggling the renderer does not fork
 * state. The 2D branch reuses /map's mount path, not a parallel
 * Cosmograph runtime.
 */
export default async function GraphPage() {
  await connection();
  let bundle: Awaited<ReturnType<typeof fetchActiveGraphBundle>> | null = null;
  try {
    bundle = await fetchActiveGraphBundle();
  } catch (error) {
    // Log so the failure mode is visible in the server console instead of
    // silently producing an "unavailable" HUD state.
    console.error("[graph/page] fetchActiveGraphBundle failed:", error);
  }

  if (bundle == null) {
    return <GraphBundleUnavailable />;
  }

  return <GraphSurfaceSwitch bundle={bundle} />;
}
