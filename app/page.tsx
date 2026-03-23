import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { DashboardShell, GraphErrorBoundary } from "@/features/graph";

export default async function GraphPage() {
  const bundle = await fetchActiveGraphBundle();

  return (
    <GraphErrorBoundary>
      <DashboardShell bundle={bundle} />
    </GraphErrorBoundary>
  );
}
