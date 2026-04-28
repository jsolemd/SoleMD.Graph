"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";
import { useCallback, useEffect, useRef, useState } from "react";

import { useGraphWarmup } from "@/features/graph/hooks/use-graph-warmup";
import { usePaperAttributesBaker } from "../bake/use-paper-attributes-baker";
import { useOrbEvidencePulseResolver } from "../bake/use-orb-evidence-pulse-resolver";
import { useOrbFocusResolver } from "../bake/use-orb-focus-resolver";
import { useOrbSelectionResolver } from "../bake/use-orb-selection-resolver";
import { useOrbScopeResolver } from "../bake/use-orb-scope-resolver";
import { buildSelectedViewPredicate } from "@/features/graph/duckdb/sql-helpers";
import { clearSelectionState } from "@/features/graph/lib/graph-selection-state";
import {
  useDashboardStore,
  useGraphStore,
  useShellStore,
} from "@/features/graph/stores";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import {
  OrbInteractionSurface,
  type OrbSelectionRect,
} from "../interaction/OrbInteractionSurface";
import { OrbTouchTwist } from "../interaction/OrbTouchTwist";
import { useOrbClick } from "../interaction/use-orb-click";
import { useOrbHover } from "../interaction/use-orb-hover";
import { useOrbRectSelection } from "../interaction/use-orb-rect-selection";
import { useOrbSelectionEscape } from "../interaction/use-orb-selection-escape";
import {
  ORB_PICK_NO_HIT,
  useOrbPickerStore,
} from "../interaction/orb-picker-store";
import { OrbChromeBar } from "../chrome/OrbChromeBar";
import { OrbHoverBillboard } from "../chrome/OrbHoverBillboard";
import { OrbLegendOverlay } from "../chrome/OrbLegendOverlay";
import type { GraphSelectionChordState } from "@/features/graph/lib/graph-selection-chords";
import {
  OrbWebGpuCanvas,
  type OrbWebGpuCanvasStatus,
} from "../webgpu/OrbWebGpuCanvas";

// SSR-disabled: GraphPanelsLayer transitively pulls @/features/graph/cosmograph
// (DetailPanel/WikiPanel/InfoPanel/PromptBox), whose top-level
// @cosmograph/react module references `Worker` and crashes Node SSR.
// DashboardShell (the 2D path) sidesteps this by being mounted via
// dynamic({ ssr: false }) one level up; OrbSurface has no such parent
// guard, so the opt-out lives at this mount call.
const GraphPanelsLayer = dynamic(
  () =>
    import("@/features/graph/components/shell/GraphPanelsLayer").then(
      (mod) => mod.GraphPanelsLayer,
    ),
  { ssr: false, loading: () => null },
);
const TimelineBar = dynamic(
  () =>
    import("@/features/graph/components/chrome/TimelineBar").then(
      (mod) => mod.TimelineBar,
    ),
  { ssr: false, loading: () => null },
);

const SELECTED_POINT_INDICES_SCOPE_SQL = buildSelectedViewPredicate();

function clearOrbVisualSelectionState(clearScopeLane: boolean): void {
  const graph = useGraphStore.getState();
  graph.setFocusedPointIndex(null);
  graph.selectNode(null);
  const focusVisual = useOrbFocusVisualStore.getState();

  if (clearScopeLane) {
    focusVisual.reset();
    return;
  }

  focusVisual.setFocusIndex(null);
  focusVisual.setHoverIndex(null);
  focusVisual.setSelectionIndices([]);
  focusVisual.setNeighborIndices([]);
}

/**
 * Orb surface for /graph.
 *
 * Owns the /graph orb workspace shell. The 3D particle core is the
 * raw WebGPU `OrbWebGpuCanvas`; DashboardClientShell keeps the legacy
 * FieldCanvas for landing mode only. OrbSurface provides the orb-specific
 * content layer:
 *
 *   - Kicks off the progressive paper baker against the active bundle's
 *     DuckDB connection. Chunks flow into the orb geometry mutation
 *     store, and the WebGPU canvas packs them into storage buffers.
 *   - Click capture: orb picker resolves a particle index. Plain clicks
 *     dispatch through the shared `useResolveAndSelectNode` funnel into
 *     `useGraphStore.selectedNode`; Shift-click uses the explicit
 *     `selected_point_indices` lane for additive selection; the
 *     rectangle tool batches a WebGPU compute readback into the same
 *     explicit selection commit path.
 *   - Mounts the renderer-clean panel chrome via GraphPanelsLayer (the
 *     same component DashboardShell uses for 2D), plus OrbChromeBar
 *     for the 3D-only opener pills. Slice F adds orb-native legends
 *     and hover labels; Slice G routes filters/timeline
 *     through shared scope SQL so both renderers see the same subset.
 *   - Dev-only HUD shows streaming progress so the orb bring-up can be
 *     verified visually.
 */
export function OrbSurface({ bundle }: { bundle: GraphBundle | null }) {
  const { canvas, connection, queries, status } = useGraphWarmup(bundle);
  const orbSelectionTool = useDashboardStore((s) => s.orbSelectionTool);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const setOrbSelectionTool = useDashboardStore((s) => s.setOrbSelectionTool);
  const [webGpuStatus, setWebGpuStatus] =
    useState<OrbWebGpuCanvasStatus | null>(null);
  const clickRequestIdRef = useRef(0);

  const paperState = usePaperAttributesBaker({
    connection,
    enabled: connection != null,
  });
  const setOrbResidentPointCount = useDashboardStore(
    (s) => s.setOrbResidentPointCount,
  );

  useEffect(() => {
    setOrbResidentPointCount(paperState.count);
    return () => setOrbResidentPointCount(null);
  }, [paperState.count, setOrbResidentPointCount]);

  // Slice 8: filter / timeline scope reflection. The paper baker
  // materializes `paper_sample` during its first stats query — gate
  // the resolver on `paperState.count` so we don't query the table
  // before it exists. The particle count read off paperState matches
  // the resolver's mask sizing.
  useOrbScopeResolver({
    connection,
    particleCount: paperState.count ?? 0,
    enabled: connection != null,
    paperSampleReady: paperState.count != null,
  });
  useOrbEvidencePulseResolver({
    queries,
    particleCount: paperState.count ?? 0,
    enabled: queries != null,
    paperSampleReady: paperState.count != null,
  });
  useOrbFocusResolver({
    queries,
    particleCount: paperState.count ?? 0,
    enabled: queries != null,
    paperSampleReady: paperState.count != null,
  });
  useOrbSelectionResolver({
    connection,
    particleCount: paperState.count ?? 0,
    enabled: connection != null,
    paperSampleReady: paperState.count != null,
  });

  // Clear dynamic WebGPU flag lanes when the orb unmounts so a later
  // remount starts without stale focus, hover, scope, or evidence bits.
  useEffect(() => {
    return () => {
      useOrbFocusVisualStore.getState().reset();
    };
  }, []);

  const selectByIndex = useOrbClick(queries, "corpus");
  const releaseOrbSelectionTool = useCallback(() => {
    setOrbSelectionTool("navigate");
  }, [setOrbSelectionTool]);
  const [rectSelectionNotice, setRectSelectionNotice] = useState<string | null>(
    null,
  );
  const handleRectSelectionTooLarge = useCallback((count: number) => {
    setRectSelectionNotice(
      `Selection contains ${count.toLocaleString()} papers; drag a smaller area.`,
    );
  }, []);
  const handleRectSelectionCommitted = useCallback((count: number) => {
    setRectSelectionNotice(
      count > 0
        ? `Selected ${count.toLocaleString()} papers.`
        : "Selection cleared.",
    );
  }, []);
  const handleRectSelectionFailed = useCallback(() => {
    setRectSelectionNotice("Selection failed. Try a smaller area.");
  }, []);
  const handleRectSelect = useOrbRectSelection({
    queries,
    activeLayer: "corpus",
    enabled: paperState.count != null,
    onSelectionTooLarge: handleRectSelectionTooLarge,
    onSelectionCommitted: handleRectSelectionCommitted,
    onSelectionFailed: handleRectSelectionFailed,
  });

  const handleOrbRectSelect = useCallback(
    (rect: OrbSelectionRect, chords: GraphSelectionChordState) => {
      handleRectSelect(rect, chords);
      // The rectangle tool is a one-shot action: drag to select, then
      // return to navigation so the next drag rotates the orb again.
      releaseOrbSelectionTool();
    },
    [handleRectSelect, releaseOrbSelectionTool],
  );

  const clearOrbSelection = useCallback(() => {
    releaseOrbSelectionTool();
    const dashboard = useDashboardStore.getState();
    const shouldClearScope =
      dashboard.currentPointScopeSql === SELECTED_POINT_INDICES_SCOPE_SQL ||
      dashboard.activeSelectionSourceId != null;
    dashboard.unlockSelection();

    void clearSelectionState({
      queries,
      setSelectedPointCount: dashboard.setSelectedPointCount,
      setActiveSelectionSourceId: dashboard.setActiveSelectionSourceId,
      scopeUpdate: shouldClearScope
        ? {
            currentPointScopeSql: null,
            setCurrentPointScopeSql: dashboard.setCurrentPointScopeSql,
            forceRevision: true,
          }
        : undefined,
      clearNode: () => {
        clearOrbVisualSelectionState(shouldClearScope);
      },
    }).catch(() => {});
  }, [queries, releaseOrbSelectionTool]);

  const clearAllOrbSelection = useCallback(() => {
    releaseOrbSelectionTool();
    const dashboard = useDashboardStore.getState();
    dashboard.clearVisibilityFocus();
    dashboard.clearVisibilityScopeClauses();
    dashboard.setTimelineSelection(undefined);
    dashboard.setTableView("dataset");
    dashboard.unlockSelection();

    void clearSelectionState({
      queries,
      setSelectedPointCount: dashboard.setSelectedPointCount,
      setActiveSelectionSourceId: dashboard.setActiveSelectionSourceId,
      scopeUpdate: {
        currentPointScopeSql: null,
        setCurrentPointScopeSql: dashboard.setCurrentPointScopeSql,
        forceRevision: true,
      },
      clearNode: () => {
        clearOrbVisualSelectionState(true);
      },
    }).catch(() => {});
  }, [queries, releaseOrbSelectionTool]);

  useOrbSelectionEscape({
    onClearSelection: clearOrbSelection,
    onClearAllSelection: clearAllOrbSelection,
  });

  const { handleHoverMove, clearHover } = useOrbHover({
    particleCount: paperState.count ?? 0,
    enabled: paperState.count != null,
  });
  const [hoverCursor, setHoverCursor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const handleOrbHoverMove = useCallback(
    (clientX: number, clientY: number) => {
      setHoverCursor({ x: clientX, y: clientY });
      handleHoverMove(clientX, clientY);
    },
    [handleHoverMove],
  );
  const handleOrbHoverClear = useCallback(() => {
    setHoverCursor(null);
    clearHover();
  }, [clearHover]);

  useEffect(() => {
    if (!rectSelectionNotice) return;
    const timer = window.setTimeout(() => {
      setRectSelectionNotice(null);
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [rectSelectionNotice]);

  // Dev-only diagnostic: last pick result so the HUD can show whether
  // clicks are landing and what the picker is returning. Strips out of
  // production builds via the NODE_ENV gate on the HUD itself.
  const [lastPick, setLastPick] = useState<
    { kind: "miss" } | { kind: "hit"; index: number } | null
  >(null);

  const handleCapturedClick = useCallback(
    (
      clientX: number,
      clientY: number,
      chords: GraphSelectionChordState,
    ) => {
      const handle = useOrbPickerStore.getState().handle;
      if (!handle) {
        setLastPick(null);
        releaseOrbSelectionTool();
        return;
      }
      const requestId = ++clickRequestIdRef.current;
      void handle
        .pickAsync(clientX, clientY)
        .then((index) => {
          if (requestId !== clickRequestIdRef.current) return;
          if (index === ORB_PICK_NO_HIT) {
            setLastPick({ kind: "miss" });
            releaseOrbSelectionTool();
            return;
          }
          setLastPick({ kind: "hit", index });
          selectByIndex(index, chords);
          releaseOrbSelectionTool();
        })
        .catch(() => {
          if (requestId === clickRequestIdRef.current) {
            setLastPick({ kind: "miss" });
            releaseOrbSelectionTool();
          }
        });
    },
    [releaseOrbSelectionTool, selectByIndex],
  );

  // Mobile parity for the desktop spacebar shortcut. Hits the same
  // shell-store flag that MotionControlPanel writes, so motion pause
  // stays one shared state regardless of input source.
  const handleDoubleTapPause = useCallback(() => {
    const store = useShellStore.getState();
    store.setPauseMotion(!store.pauseMotion);
  }, []);

  const panelsReady = bundle != null && queries != null && canvas != null;

  return (
    <main className="relative min-h-screen">
      <OrbWebGpuCanvas
        particleCount={paperState.count}
        onStatusChange={setWebGpuStatus}
      />
      <OrbInteractionSurface
        onClick={handleCapturedClick}
        onDoubleTap={handleDoubleTapPause}
        onHoverMove={handleOrbHoverMove}
        onHoverClear={handleOrbHoverClear}
        rectSelectionEnabled={orbSelectionTool === "rectangle"}
        onRectSelectionCancel={releaseOrbSelectionTool}
        onRectSelect={handleOrbRectSelect}
      />
      <OrbTouchTwist />
      {panelsReady ? (
        <GraphPanelsLayer bundle={bundle} queries={queries} canvas={canvas} />
      ) : null}
      {!uiHidden && showTimeline && bundle && queries && canvas ? (
        <TimelineBar
          queries={queries}
          bundleChecksum={bundle.bundleChecksum}
          overlayRevision={canvas.overlayRevision}
        />
      ) : null}
      <OrbChromeBar />
      <OrbLegendOverlay paperState={paperState} />
      <OrbHoverBillboard
        cursor={hoverCursor}
        enabled={paperState.count != null}
        queries={queries}
      />
      {rectSelectionNotice ? (
        <OrbSelectionNotice message={rectSelectionNotice} />
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <OrbStreamingHud
          paperState={paperState}
          warmupStatus={status}
          webGpuStatus={webGpuStatus}
          lastPick={lastPick}
        />
      ) : null}
    </main>
  );
}

function OrbSelectionNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-5 z-40 -translate-x-1/2 rounded-full px-3 py-2 text-xs font-medium"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        color: "var(--graph-panel-text)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      {message}
    </div>
  );
}

function OrbStreamingHud({
  paperState,
  warmupStatus,
  webGpuStatus,
  lastPick,
}: {
  paperState: ReturnType<typeof usePaperAttributesBaker>;
  warmupStatus: string;
  webGpuStatus: OrbWebGpuCanvasStatus | null;
  lastPick: { kind: "miss" } | { kind: "hit"; index: number } | null;
}) {
  const chunkCount = useOrbGeometryMutationStore((s) => s.chunks.length);
  const percent = Math.round(paperState.progress * 100);
  const pickerReady = useOrbPickerStore((s) => s.handle !== null);

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
      <div>webgpu: {formatWebGpuStatus(webGpuStatus)}</div>
      <div>
        chunks: {chunkCount} · {percent}%
      </div>
      <div>picker: {pickerReady ? "ready" : "not ready"}</div>
      <div>
        last pick:{" "}
        {lastPick === null
          ? "—"
          : lastPick.kind === "miss"
            ? "miss"
            : `#${lastPick.index}`}
      </div>
      {paperState.error ? (
        <div style={{ color: "tomato" }}>err: {paperState.error.message}</div>
      ) : null}
    </div>
  );
}

function formatWebGpuStatus(status: OrbWebGpuCanvasStatus | null): string {
  if (status == null) return "initializing";
  if (status.kind === "running") return status.profile.name;
  if (status.kind === "unsupported") return status.reason;
  if (status.kind === "device-lost") return "device lost";
  if (status.kind === "error") return "error";
  return status.kind;
}
