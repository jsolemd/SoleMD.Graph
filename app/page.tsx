import { fetchActiveGraphBundle } from "@/lib/graph/fetch";
import { GraphErrorBoundary } from "@/components/graph/GraphErrorBoundary";
import { DashboardShell } from "@/components/graph/DashboardShell";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const bundle = await fetchActiveGraphBundle();

  return (
    <GraphErrorBoundary>
      <DashboardShell bundle={bundle} />
    </GraphErrorBoundary>
  );
}
