import { connection } from "next/server";
import Link from "next/link";
import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch";
import { DashboardShell, GraphErrorBoundary } from "@/features/graph";

export default async function MapPage() {
  await connection();
  const bundle = await fetchActiveGraphBundle().catch(() => null);

  if (bundle == null) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-6"
        style={{ backgroundColor: "var(--background)" }}
      >
        <div
          className="max-w-[520px] rounded-[1.5rem] border px-8 py-8 text-center"
          style={{
            backgroundColor: "var(--graph-panel-bg)",
            borderColor: "var(--graph-panel-border)",
            boxShadow: "var(--graph-panel-shadow)",
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--graph-panel-text-dim)" }}
          >
            Graph Unavailable
          </p>
          <h1
            className="mt-4 text-[2rem] font-medium leading-tight tracking-[-0.03em]"
            style={{ color: "var(--graph-panel-text)" }}
          >
            The graph workspace could not be prepared right now.
          </h1>
          <p
            className="mt-4 text-[15px] leading-7"
            style={{
              color:
                "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
            }}
          >
            Return to the ambient landing page and keep exploring there while
            the graph runtime is unavailable.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              backgroundColor: "var(--graph-prompt-bg)",
              boxShadow: "var(--graph-prompt-shadow)",
              color: "var(--graph-panel-text)",
            }}
          >
            Back to landing page
          </Link>
        </div>
      </main>
    );
  }

  return (
    <GraphErrorBoundary>
      <DashboardShell bundle={bundle} />
    </GraphErrorBoundary>
  );
}
