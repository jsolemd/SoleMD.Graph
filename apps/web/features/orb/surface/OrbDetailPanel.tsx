"use client";

import Link from "next/link";
import { useGraphStore } from "@/features/graph/stores";

/**
 * Orb-mode detail panel — renders the currently selected paper record
 * from `useGraphStore.selectedNode`. No selection → compact empty
 * state that explains what "pick a particle" means in this context.
 *
 * Kept lean in step 5e: no actions, no external fetches, no nested
 * components. Mantine/shell chrome is intentionally out until orb UX
 * stabilizes (plan: "defer the ChromeBar refactor").
 */
export function OrbDetailPanel() {
  const node = useGraphStore((s) => s.selectedNode);

  return (
    <aside
      className="pointer-events-auto fixed bottom-6 right-6 z-20 max-w-[380px] rounded-[1.25rem] px-5 py-4"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        boxShadow: "var(--graph-panel-shadow)",
        color: "var(--graph-panel-text)",
      }}
    >
      {node == null ? (
        <EmptyState />
      ) : (
        <SelectedPaper
          citekey={node.citekey}
          clusterLabel={node.clusterLabel}
          displayLabel={node.displayLabel}
          journal={node.journal}
          paperTitle={node.paperTitle}
          year={node.year}
        />
      )}

      <div className="mt-4 flex items-center gap-3 text-[13px]">
        <Link
          href="/map"
          className="inline-flex rounded-full px-3 py-1.5 font-medium transition-[filter] hover:brightness-110"
          style={{
            backgroundColor: "var(--graph-prompt-bg)",
            boxShadow: "var(--graph-prompt-shadow)",
            color: "var(--graph-panel-text)",
          }}
        >
          View 2D map
        </Link>
        <Link
          href="/"
          className="inline-flex font-medium opacity-70 hover:opacity-100"
          style={{ color: "var(--graph-panel-text)" }}
        >
          Landing
        </Link>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div>
      <p
        className="text-xs font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--graph-panel-text-dim)" }}
      >
        Orb Mode
      </p>
      <p className="mt-2 text-[15px] leading-6">
        Each particle is a paper sampled from the corpus. Click a
        particle to read its record.
      </p>
    </div>
  );
}

function SelectedPaper({
  citekey,
  clusterLabel,
  displayLabel,
  journal,
  paperTitle,
  year,
}: {
  citekey: string | null;
  clusterLabel: string | null;
  displayLabel: string | null;
  journal: string | null;
  paperTitle: string | null;
  year: number | null;
}) {
  const title = paperTitle ?? displayLabel ?? citekey ?? "Untitled paper";
  const meta = [year?.toString(), journal, clusterLabel]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div>
      <p
        className="text-xs font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--graph-panel-text-dim)" }}
      >
        Paper
      </p>
      <h2 className="mt-2 text-[17px] font-medium leading-snug tracking-[-0.01em]">
        {title}
      </h2>
      {meta ? (
        <p
          className="mt-2 text-[13px] leading-5"
          style={{
            color:
              "color-mix(in srgb, var(--graph-panel-text) 72%, transparent)",
          }}
        >
          {meta}
        </p>
      ) : null}
    </div>
  );
}
