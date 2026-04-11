"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type CSSProperties } from "react";
import { GraphShell } from "@/features/graph/cosmograph";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { GraphBundleErrorState, GraphBundleLoadingOverlay } from "./loading";
import { BottomToolbar, useBottomChromeFloat } from "./chrome";
import { panelSurfaceStyle, promptSurfaceStyle } from "../panels/PanelShell";
import { preloadChromeChunks } from "./preload-chrome-chunks";
import { EntityHoverCardProvider } from "@/features/graph/components/entities/EntityHoverCardProvider";
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
      <EntityHoverCardProvider>
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
    </EntityHoverCardProvider>
    </GraphShell>
  );
}
