"use client";

import type { GraphBundle } from "@solemd/graph";
import { useEffect } from "react";

import { useGraphWarmup } from "@/features/graph/hooks/use-graph-warmup";
import { usePaperAttributesBaker } from "../bake/use-paper-attributes-baker";
import { useFieldRuntime } from "@/features/field/renderer/field-runtime-context";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import { OrbDetailPanel } from "./OrbDetailPanel";

/**
 * Orb surface for /graph.
 *
 * Mounts on top of the layout-owned field canvas. No R3F mount of its
 * own — the 16384-particle substrate is provided by
 * DashboardClientShell (hoisted in step 5a); OrbSurface only provides
 * the orb-specific content layer:
 *
 *   1. Kicks off the progressive paper baker (5d) against the active
 *      bundle's DuckDB connection. Chunks flow into the orb geometry
 *      mutation store → the blob-geometry subscriber (5b) writes them
 *      into the shared BufferGeometry → particles visibly hydrate into
 *      paper-mode (citation-weighted speeds, entity-weighted sizes)
 *      without repainting.
 *   2. Marks stageReady=true so FieldScene starts ticking the blob
 *      controller at /graph entry even before landing has ever run.
 *   3. Shows a detail panel observing useGraphStore.selectedNode and a
 *      "View 2D map" escape hatch. Selection integration lands in the
 *      GPU-picking follow-up — see use-orb-click.ts.
 *   4. Dev-only HUD shows streaming progress so the orb bring-up can
 *      be verified visually.
 *
 * Landing is never imported from here. The only shared surface is the
 * BufferGeometry attribute contract + the mutation store — both treated
 * as opaque substrate.
 */
export function OrbSurface({ bundle }: { bundle: GraphBundle | null }) {
  const { connection, status } = useGraphWarmup(bundle);
  const { setStageReady } = useFieldRuntime();

  // Orb doesn't wait on FixedStageManager — the blob controller needs
  // to be ticking when the user arrives at /graph so paper mutations
  // are rendered. Mark ready on mount; clear on unmount so a back-nav
  // to landing re-gates on FixedStageManager.
  useEffect(() => {
    setStageReady(true);
    return () => setStageReady(false);
  }, [setStageReady]);

  const paperState = usePaperAttributesBaker({
    connection,
    enabled: connection != null,
  });

  return (
    <main className="relative min-h-screen">
      <OrbDetailPanel />
      {process.env.NODE_ENV !== "production" ? (
        <OrbStreamingHud paperState={paperState} warmupStatus={status} />
      ) : null}
    </main>
  );
}

function OrbStreamingHud({
  paperState,
  warmupStatus,
}: {
  paperState: ReturnType<typeof usePaperAttributesBaker>;
  warmupStatus: string;
}) {
  const chunkCount = useOrbGeometryMutationStore((s) => s.chunks.length);
  const percent = Math.round(paperState.progress * 100);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-6 z-20 rounded-lg px-3 py-2 font-mono text-xs"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        color: "var(--graph-panel-text-dim)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      <div>bundle: {warmupStatus}</div>
      <div>baker: {paperState.status}</div>
      <div>
        chunks: {chunkCount} · {percent}%
      </div>
      {paperState.error ? (
        <div style={{ color: "tomato" }}>err: {paperState.error.message}</div>
      ) : null}
    </div>
  );
}
