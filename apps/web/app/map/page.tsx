import { connection } from "next/server";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { DashboardShell, GraphErrorBoundary } from "@/features/graph";
import { GraphBundleUnavailable } from "@/features/graph/components/shell/GraphBundleUnavailable";

export default async function MapPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  if (bundle == null) {
    return <GraphBundleUnavailable />;
  }

  return (
    <GraphErrorBoundary>
      <DashboardShell bundle={bundle} />
    </GraphErrorBoundary>
  );
}
