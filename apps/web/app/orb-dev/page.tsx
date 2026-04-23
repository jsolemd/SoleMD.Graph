import type { Metadata } from "next";
import { connection } from "next/server";
import { OrbDevSurface } from "@/features/graph/orb/OrbDevSurface";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";

/**
 * Hidden /orb-dev sandbox route.
 *
 * Quarantined from /graph, / (landing), and the Cosmograph/DashboardShell
 * tree. Reuses the existing bundle-fetch + DuckDB session pipeline so the
 * orb can sanity-check itself against real 2D data when available, and
 * falls back to mock unit-sphere data on cold bundles.
 *
 * No SEO, no nav entry — this is a developer surface.
 */
export const metadata: Metadata = {
  title: "orb-dev (sandbox) — SoleMD",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

/**
 * Optional real-fixture path, read from NEXT_PUBLIC_ORB_DEV_FIXTURE_URL at
 * build/serve time. When absent, the surface renders mock data. Expected
 * shape: `https://.../release_points_3d.parquet` (absolute URL) so DuckDB
 * can `read_parquet` it directly. Once Lane A lands a real fixture, set
 * this env var and the surface swaps over without a code change.
 */
const FIXTURE_URL = process.env.NEXT_PUBLIC_ORB_DEV_FIXTURE_URL ?? null;

export default async function OrbDevPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  return <OrbDevSurface bundle={bundle} fixturePath={FIXTURE_URL} />;
}
