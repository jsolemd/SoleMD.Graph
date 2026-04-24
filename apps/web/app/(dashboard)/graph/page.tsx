import { connection } from "next/server";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { OrbSurface } from "@/features/orb/surface/OrbSurface";

/**
 * Orb mode — /graph.
 *
 * The 16384-particle field canvas is mounted in the (dashboard) layout
 * (step 5a) and stays live across navigations under Next 16's
 * cacheComponents. This page renders OrbSurface which streams paper
 * identity into the same geometry via the orb mutation store. No
 * Cosmograph, no separate WebGL context — the orb IS the field.
 */
export default async function GraphPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  return <OrbSurface bundle={bundle} />;
}
