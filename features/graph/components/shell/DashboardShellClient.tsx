"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { GraphShell, ColorLegends, SizeLegend } from "@/features/graph/cosmograph";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useGraphBundle } from "@/features/graph/hooks/use-graph-bundle";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { PromptBox } from "../panels/PromptBox";
import { TimelineBar } from "../chrome/TimelineBar";
import { StatsBar } from "../chrome/StatsBar";
import { CanvasControls } from "../explore/CanvasControls";
import { ConfigPanel } from "../explore/ConfigPanel";
import { FiltersPanel } from "../explore/FiltersPanel";
import { InfoPanel } from "../explore/info-panel";
import { QueryPanel } from "../explore/query-panel";
import { DataTable } from "../explore/data-table";
import { DetailPanel } from "../panels/DetailPanel";
import { AboutPanel } from "../panels/AboutPanel";
import { GraphBundleLoadingOverlay, GraphBundleErrorState } from "./loading";
import { GraphAttribution, TIMELINE_HEIGHT, BottomToolbar } from "./chrome";
import type { GraphBundle, GraphStats } from "@/features/graph/types";

const legendStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
  boxShadow: "var(--graph-panel-shadow)",
  padding: 8,
};

export function DashboardShellClient({ bundle }: { bundle: GraphBundle }) {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const setPanelsVisible = useDashboardStore((s) => s.setPanelsVisible);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const isSelectionLocked = useDashboardStore((s) => s.selectionLocked);
  const { canvas, error, loading, progress, queries } = useGraphBundle(bundle);

  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  const canvasShifted = isCreate && !promptMinimized;
  const isContinuousColor = pointColorStrategy === "continuous";

  const setShowTimeline = useDashboardStore((s) => s.setShowTimeline);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);

  useEffect(() => {
    if (layout.autoShowPanels) setPanelsVisible(true);
    if (layout.autoShowTimeline) setShowTimeline(true);
    if (layout.autoShowTable) setTableOpen(true);
  }, [layout.autoShowPanels, layout.autoShowTimeline, layout.autoShowTable, setPanelsVisible, setShowTimeline, setTableOpen]);

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  if (loading || !canvas || !queries) {
    return <GraphBundleLoadingOverlay bundle={bundle} progress={progress} canvasReady={false} />;
  }

  const stats: GraphStats = {
    points: canvas.pointCounts.corpus,
    pointLabel: "points",
    papers: 0,
    clusters:
      typeof bundle.qaSummary?.["cluster_count"] === "number"
        ? bundle.qaSummary["cluster_count"] as number
        : 0,
    noise:
      typeof bundle.qaSummary?.["noise_count"] === "number"
        ? bundle.qaSummary["noise_count"] as number
        : 0,
  };

  return (
    <GraphShell>
      <ModeColorSync />
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: canvasShifted ? "translateX(min(280px, 22.5vw))" : undefined,
            transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <GraphCanvas canvas={canvas} queries={queries} />
        </div>

        <Wordmark />

        <AnimatePresence>
          {!uiHidden && activePanel === "about" && <AboutPanel />}
        </AnimatePresence>

        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "config" && (
            <ConfigPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "filters" && (
            <FiltersPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "info" && (
            <InfoPanel queries={queries} canvas={canvas} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "query" && (
            <QueryPanel
              bundle={bundle}
              runReadOnlyQuery={queries.runReadOnlyQuery}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!uiHidden && (
            <DetailPanel bundle={bundle} queries={queries} />
          )}
        </AnimatePresence>

        {!uiHidden && (showColorLegend || showSizeLegend) && (
          <div
            className="absolute right-4 z-30 flex flex-col gap-2 transition-[bottom] duration-200"
            style={{
              bottom: 16
                + (showTimeline ? TIMELINE_HEIGHT : 0)
                + (tableOpen ? tableHeight : 0),
            }}
          >
            {showSizeLegend && (
              <SizeLegend
                selectOnClick={!isSelectionLocked}
                style={legendStyle}
              />
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
          {!uiHidden && panelsVisible && <CanvasControls />}
        </AnimatePresence>

        <AnimatePresence>
          {!uiHidden && showTimeline && <TimelineBar />}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && tableOpen && (
            <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
          )}
        </AnimatePresence>

        {!uiHidden && panelsVisible && <BottomToolbar />}
        {!uiHidden && <GraphAttribution />}

        {!uiHidden && <PromptBox bundle={bundle} queries={queries} />}
        {!uiHidden && layout.showStatsBar && (
          <div className="absolute right-3 top-[52px] z-40 flex flex-col items-end gap-1.5">
            <StatsBar stats={stats} />
          </div>
        )}
      </div>
    </GraphShell>
  );
}
