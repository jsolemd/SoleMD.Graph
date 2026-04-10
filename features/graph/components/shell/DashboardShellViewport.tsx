"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import type { CSSProperties } from "react";
import { GraphShell } from "@/features/graph/cosmograph";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { StatsBar } from "../chrome/StatsBar";
import { GraphBundleErrorState, GraphBundleLoadingOverlay } from "./loading";
import { GraphAttribution, TIMELINE_HEIGHT, BottomToolbar } from "./chrome";
import type { DashboardShellController } from "./use-dashboard-shell-controller";

const legendStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
  boxShadow: "var(--graph-panel-shadow)",
  padding: 8,
};

function PromptBoxLoadingPlaceholder() {
  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div
        className="h-14 w-[min(600px,90vw)] rounded-full backdrop-blur-xl animate-pulse"
        style={{
          backgroundColor: "var(--graph-prompt-bg)",
          border: "1px solid var(--graph-prompt-border)",
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
    activePanel,
    bundle,
    canvas,
    canvasShifted,
    error,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked,
    layoutShowStatsBar,
    loading,
    panelsVisible,
    progress,
    queries,
    showColorLegend,
    showLoading,
    showSizeLegend,
    showTimeline,
    stats,
    tableHeight,
    tableOpen,
    uiHidden,
  } = state;

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  return (
    <GraphShell>
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

            <AnimatePresence mode="wait">
              {!uiHidden && panelsVisible && activePanel === "config" && (
                <ConfigPanel key="config" />
              )}
              {!uiHidden && panelsVisible && activePanel === "filters" && (
                <FiltersPanel
                  key="filters"
                  queries={queries}
                  bundleChecksum={bundle.bundleChecksum}
                  overlayRevision={canvas.overlayRevision}
                />
              )}
              {!uiHidden && panelsVisible && activePanel === "info" && (
                <InfoPanel key="info" queries={queries} canvas={canvas} />
              )}
              {!uiHidden && panelsVisible && activePanel === "query" && (
                <QueryPanel
                  key="query"
                  bundle={bundle}
                  runReadOnlyQuery={queries.runReadOnlyQuery}
                />
              )}
              {!uiHidden && panelsVisible && activePanel === "wiki" && (
                <WikiPanel key="wiki" bundle={bundle} />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!uiHidden && <DetailPanel bundle={bundle} queries={queries} />}
            </AnimatePresence>

            {!uiHidden && (showColorLegend || showSizeLegend) && (
              <div
                className="absolute right-4 z-30 flex flex-col gap-2 transition-[bottom] duration-200"
                style={{
                  bottom: 32 + (showTimeline ? TIMELINE_HEIGHT : 0) + (tableOpen ? tableHeight : 0),
                }}
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
              </div>
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
          {!uiHidden && activePanel === "about" && <AboutPanel />}
        </AnimatePresence>

        {!uiHidden && panelsVisible && <BottomToolbar />}
        {!uiHidden && <GraphAttribution />}
        {!uiHidden && <PromptBox bundle={bundle} queries={queries ?? null} />}
        {!uiHidden && layoutShowStatsBar && stats != null && (
          <div className="absolute right-3 top-[52px] z-40 flex flex-col items-end gap-1.5">
            <StatsBar stats={stats} />
          </div>
        )}
      </div>
    </GraphShell>
  );
}
