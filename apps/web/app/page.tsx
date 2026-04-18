import { connection } from "next/server";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { DashboardShell, GraphErrorBoundary } from "@/features/graph";

// The landing graph shell depends on runtime bundle metadata from Postgres.
// Wait for a request before resolving bundle metadata so builds do not need
// DATABASE_URL at prerender time.

export default async function GraphPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle();

  return (
    <GraphErrorBoundary>
      <DashboardShell bundle={bundle} />
    </GraphErrorBoundary>
  );
}
