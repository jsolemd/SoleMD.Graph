"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { GraphShell, useGraphSelection } from "@/features/graph/cosmograph";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { GraphBundleErrorState, GraphBundleLoadingOverlay } from "./loading";
import { BottomToolbar, useBottomChromeFloat } from "./chrome";
import { panelSurfaceStyle, promptSurfaceStyle } from "../panels/PanelShell";
import { preloadChromeChunks } from "./preload-chrome-chunks";
import { EntityHoverCardProvider } from "@/features/graph/components/entities/EntityHoverCardProvider";
import { syncEntityOverlay } from "@/features/graph/components/entities/entity-overlay-sync";
import { commitSelectionState } from "@/features/graph/lib/graph-selection-state";
import { resolveGraphReleaseId } from "@/features/graph/lib/graph-release";
import { ENTITY_OVERLAY_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";
import type { GraphBundle, GraphBundleQueries } from "@/features/graph/types";
import { getEntityWikiSlug } from "@/features/wiki/lib/entity-wiki-route";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import type { DashboardShellController } from "./use-dashboard-shell-controller";

const legendStyle: CSSProperties = {
  ...panelSurfaceStyle,
  borderRadius: 12,
  padding: 8,
};

function PromptBoxLoadingPlaceholder() {
  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div
        className="h-14 w-[min(600px,90vw)] rounded-full backdrop-blur-xl animate-pulse"
        style={{
          ...promptSurfaceStyle,
        }}
      />
    </div>
  );
}

const PromptBox = dynamic(
  () => import("../panels/PromptBox").then((mod) => mod.PromptBox),
  { loading: () => <PromptBoxLoadingPlaceholder /> },
);
const ConfigPanel = dynamic(
  () => import("../explore/ConfigPanel").then((mod) => mod.ConfigPanel),
  { loading: () => null },
);
const FiltersPanel = dynamic(
  () => import("../explore/FiltersPanel").then((mod) => mod.FiltersPanel),
  { loading: () => null },
);
const InfoPanel = dynamic(
  () => import("../explore/info-panel").then((mod) => mod.InfoPanel),
  { loading: () => null },
);
const QueryPanel = dynamic(
  () => import("../explore/query-panel").then((mod) => mod.QueryPanel),
  { loading: () => null },
);
const DataTable = dynamic(
  () => import("../explore/data-table").then((mod) => mod.DataTable),
  { loading: () => null },
);
const DetailPanel = dynamic(
  () => import("../panels/DetailPanel").then((mod) => mod.DetailPanel),
  { loading: () => null },
);
const RagResponsePanel = dynamic(
  () => import("../panels/prompt/RagResponsePanel").then((mod) => mod.RagResponsePanel),
  { loading: () => null },
);
const AboutPanel = dynamic(
  () => import("../panels/AboutPanel").then((mod) => mod.AboutPanel),
  { loading: () => null },
);
const WikiPanel = dynamic(
  () => import("@/features/wiki/components/WikiPanel").then((mod) => mod.WikiPanel),
  { loading: () => null },
);
const TimelineBar = dynamic(
  () => import("../chrome/TimelineBar").then((mod) => mod.TimelineBar),
  { loading: () => null },
);
const CanvasControls = dynamic(
  () => import("../explore/CanvasControls").then((mod) => mod.CanvasControls),
  { loading: () => null },
);
const ColorLegends = dynamic(
  () =>
    import("@/features/graph/cosmograph/widgets/ColorLegends").then(
      (mod) => mod.ColorLegends,
    ),
  { loading: () => null },
);
const SizeLegend = dynamic(
  () =>
    import("@/features/graph/cosmograph/widgets/SizeLegend").then(
      (mod) => mod.SizeLegend,
    ),
  { loading: () => null },
);

/**
 * Wires entity hover card actions inside the Cosmograph context.
 *
 * "Show on graph" uses native-selection-only (no canvas rebuild) — it
 * highlights papers already in the base graph via Cosmograph.selectPoints().
 * This avoids the overlay producer path which rebuilds the DuckDB canvas
 * source (creating new object references that cause Cosmograph to reinit).
 *
 * Must be rendered inside GraphShell for CosmographProvider access.
 */
function EntityHoverActionProvider({
  bundle,
  queries,
  children,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
  children: ReactNode;
}) {
  const setPanelsVisible = useDashboardStore((s) => s.setPanelsVisible);
  const openPanel = useDashboardStore((s) => s.openPanel);
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId,
  );
  const { selectPointsByIndices } = useGraphSelection();
  const graphReleaseId = resolveGraphReleaseId(bundle);
  const abortRef = useRef<AbortController | null>(null);

  const handleShowOnGraph = useCallback(
    (entity: GraphEntityRef) => {
      if (!queries) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void syncEntityOverlay({
        queries,
        entityRefs: [
          { entityType: entity.entityType, sourceIdentifier: entity.sourceIdentifier },
        ],
        graphReleaseId,
        signal: controller.signal,
        useNativeSelectionOnly: true,
      })
        .then(async (result) => {
          if (controller.signal.aborted) return;
          if (result.selectedPointIndices.length === 0) return;

          await commitSelectionState({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            queries,
            pointIndices: result.selectedPointIndices,
            setSelectedPointCount,
            setActiveSelectionSourceId,
          });

          if (controller.signal.aborted) return;

          selectPointsByIndices({
            sourceId: ENTITY_OVERLAY_SELECTION_SOURCE_ID,
            pointIndices: result.selectedPointIndices,
          });
        })
        .catch(() => {});
    },
    [
      graphReleaseId,
      queries,
      selectPointsByIndices,
      setActiveSelectionSourceId,
      setSelectedPointCount,
    ],
  );

  const handleOpenWiki = useCallback(
    (entity: GraphEntityRef) => {
      setPanelsVisible(true);
      openPanel("wiki");
      useWikiStore.getState().navigateToPage(getEntityWikiSlug(entity));
    },
    [setPanelsVisible, openPanel],
  );

  return (
    <EntityHoverCardProvider
      onShowOnGraph={handleShowOnGraph}
      onOpenWiki={handleOpenWiki}
    >
      {children}
    </EntityHoverCardProvider>
  );
}

export function DashboardShellViewport(state: DashboardShellController) {
  const {
    bundle,
    canvas,
    canvasShifted,
    error,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked,
    loading,
    openPanels,
    panelsVisible,
    progress,
    queries,
    showColorLegend,
    showLoading,
    showSizeLegend,
    showTimeline,
    tableOpen,
    uiHidden,
  } = state;
  const legendFloat = useBottomChromeFloat();
  const ragPanelOpen = useDashboardStore((s) => s.ragPanelOpen);

  // Prefetch lazy chrome chunks once the canvas is live so the first click on
  // Timeline/Table (or any panel) is a cache hit — otherwise the toolbar lifts
  // immediately while the chunk is still being fetched, leaving the content
  // gap until it arrives.
  const canvasReady = !loading && canvas != null && queries != null;
  useEffect(() => {
    if (!canvasReady) return;
    preloadChromeChunks();
  }, [canvasReady]);

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  return (
    <GraphShell>
      <EntityHoverActionProvider bundle={bundle} queries={queries}>
      <ModeColorSync />
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        {!loading && canvas && queries && (
          <>
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                transform: canvasShifted ? "translateX(min(280px, 22.5vw))" : undefined,
                transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <GraphCanvas
                canvas={canvas}
                queries={queries}
                onFirstPaint={handleGraphFirstPaint}
              />
            </div>

            <AnimatePresence>
              {!uiHidden && panelsVisible && openPanels.config && (
                <ConfigPanel key="config" />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && panelsVisible && openPanels.filters && (
                <FiltersPanel
                  key="filters"
                  queries={queries}
                  bundleChecksum={bundle.bundleChecksum}
                  overlayRevision={canvas.overlayRevision}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && panelsVisible && openPanels.info && (
                <InfoPanel key="info" queries={queries} canvas={canvas} />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && panelsVisible && openPanels.query && (
                <QueryPanel
                  key="query"
                  runReadOnlyQuery={queries.runReadOnlyQuery}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && panelsVisible && openPanels.wiki && (
                <WikiPanel key="wiki" bundle={bundle} queries={queries} />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!uiHidden && <DetailPanel bundle={bundle} queries={queries} />}
            </AnimatePresence>

            <AnimatePresence>
              {!uiHidden && ragPanelOpen && <RagResponsePanel key="rag-response" />}
            </AnimatePresence>

            {!uiHidden && (showColorLegend || showSizeLegend) && (
              <motion.div
                className="absolute right-4 z-30 flex flex-col gap-2"
                {...legendFloat}
              >
                {showSizeLegend && (
                  <SizeLegend selectOnClick={!isSelectionLocked} style={legendStyle} />
                )}
                {showColorLegend && (
                  <ColorLegends
                    variant={isContinuousColor ? "range" : "type"}
                    selectOnClick={!isSelectionLocked}
                    style={legendStyle}
                  />
                )}
              </motion.div>
            )}

            <AnimatePresence>
              {!uiHidden && panelsVisible && <CanvasControls queries={queries} />}
            </AnimatePresence>

            <AnimatePresence>
              {!uiHidden && showTimeline && <TimelineBar />}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && tableOpen && (
                <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
              )}
            </AnimatePresence>
          </>
        )}

        <AnimatePresence>
          {showLoading && (
            <GraphBundleLoadingOverlay
              bundle={bundle}
              progress={progress}
              canvasReady={Boolean(canvas && queries)}
            />
          )}
        </AnimatePresence>

        <Wordmark />

        <AnimatePresence>
          {!uiHidden && openPanels.about && <AboutPanel />}
        </AnimatePresence>

        {!uiHidden && panelsVisible && <BottomToolbar />}
        {!uiHidden && <PromptBox bundle={bundle} queries={queries ?? null} />}
      </div>
    </EntityHoverActionProvider>
    </GraphShell>
  );
}
