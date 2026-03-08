import { fetchGraphData } from "@/lib/graph/fetch";
import { GraphErrorBoundary } from "@/components/graph/GraphErrorBoundary";
import { DashboardShell } from "@/components/graph/DashboardShell";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const data = await fetchGraphData();

  return (
    <GraphErrorBoundary>
      <DashboardShell data={data} />
    </GraphErrorBoundary>
  );
}
