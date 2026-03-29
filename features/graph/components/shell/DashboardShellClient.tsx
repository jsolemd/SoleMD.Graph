"use client";

import { useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { GraphShell, ColorLegends, SizeLegend } from "@/features/graph/cosmograph";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useGraphBundle } from "@/features/graph/hooks/use-graph-bundle";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { PromptBox } from "../panels/PromptBox";
import { TimelineBar } from "../chrome/TimelineBar";
import { GeoTimeline } from "../chrome/GeoTimeline";
import { StatsBar } from "../chrome/StatsBar";
import { LayerSwitcher } from "../chrome/LayerSwitcher";
import { CanvasControls } from "../explore/CanvasControls";
import { ConfigPanel } from "../explore/ConfigPanel";
import { FiltersPanel } from "../explore/FiltersPanel";
import { GeoFiltersPanel } from "../explore/GeoFiltersPanel";
import { InfoPanel } from "../explore/info-panel";
import { QueryPanel } from "../explore/query-panel";
import { DataTable } from "../explore/data-table";
import { GeoColorLegend } from "../chrome/GeoColorLegend";
import { DetailPanel } from "../panels/DetailPanel";
import { AboutPanel } from "../panels/AboutPanel";
import { GraphBundleLoadingOverlay, GraphBundleErrorState, GraphMetadataHydrationState } from "./loading";
import { GraphAttribution, TIMELINE_HEIGHT, BottomToolbar } from "./chrome";
import type {
  GraphBundle,
  GraphData,
} from "@/features/graph/types";

const EMPTY_GRAPH_DATA: GraphData = {
  clusters: [],
  facets: [],
  nodes: [],
  paperNodes: [],
  geoNodes: [],
  geoLinks: [],
  geoCitationLinks: [],
  paperStats: null,
  geoStats: null,
  stats: {
    points: 0,
    pointLabel: "nodes",
    papers: 0,
    clusters: 0,
    noise: 0,
  },
};

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
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const availableLayers = useDashboardStore((s) => s.availableLayers);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const isSelectionLocked = useDashboardStore((s) => s.lockedSelection !== null);
  const isMapLayer = getLayerConfig(activeLayer).rendererType === "maplibre";
  const {
    canvas,
    data,
    error,
    loading,
    metadataLoading,
    metadataError,
    progress,
    queries,
    ensureData,
  } = useGraphBundle(bundle);

  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  /** Canvas shifts right only when create editor is actually visible (not minimized to pill). */
  const canvasShifted = isCreate && !promptMinimized && !isMapLayer;
  const isContinuousColor = pointColorStrategy === "continuous";

  const setShowTimeline = useDashboardStore((s) => s.setShowTimeline);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const needsWarmMetadata = useMemo(() => {
    if (
      activeLayer === "geo" &&
      (activePanel === "info" ||
        activePanel === "filters" ||
        showTimeline ||
        showColorLegend)
    ) {
      return true;
    }

    return false;
  }, [activeLayer, activePanel, showColorLegend, showTimeline]);

  // Auto-show widgets when entering a mode that requests them (e.g. explore)
  useEffect(() => {
    if (layout.autoShowPanels) setPanelsVisible(true);
    if (layout.autoShowTimeline) setShowTimeline(true);
    if (layout.autoShowTable) setTableOpen(true);
  }, [layout.autoShowPanels, layout.autoShowTimeline, layout.autoShowTable, setPanelsVisible, setShowTimeline, setTableOpen]);

  useEffect(() => {
    if (!needsWarmMetadata || !canvas || !queries || data) {
      return;
    }

    void ensureData();
  }, [canvas, data, ensureData, needsWarmMetadata, queries]);

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  if (loading || !canvas || !queries) {
    return <GraphBundleLoadingOverlay bundle={bundle} progress={progress} canvasReady={false} />;
  }

  const detailData = data ?? EMPTY_GRAPH_DATA;
  const stats = data
    ? activeLayer === "paper" && data.paperStats
      ? data.paperStats
      : activeLayer === "geo" && data.geoStats
        ? data.geoStats
        : data.stats
    : null;

  return (
    <GraphShell>
      <ModeColorSync />
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        {/* Graph canvas — always full viewport; in create mode shift right
            so the graph centers in the visible area beside the editor. */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: canvasShifted ? "translateX(min(280px, 22.5vw))" : undefined,
            transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <GraphCanvas canvas={canvas} data={data} queries={queries} />
        </div>

        {(metadataLoading || metadataError) && (
          <GraphMetadataHydrationState progress={progress} error={metadataError} />
        )}

        {/* UI overlays — Wordmark always renders; it gates its own children via uiHidden */}
        <Wordmark />

        {/* About panel — always available via wordmark click */}
        <AnimatePresence>
          {!uiHidden && activePanel === "about" && <AboutPanel />}
        </AnimatePresence>

        {/* Left-side panels — available in all modes when panel bar is visible */}
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "config" && (
            <ConfigPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "filters" && (
            isMapLayer
              ? (data ? <GeoFiltersPanel geoNodes={data.geoNodes} /> : null)
              : <FiltersPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "info" && (
            <InfoPanel data={data} queries={queries} canvas={canvas} />
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

        {/* Right-side detail panel — always available on point click */}
        <AnimatePresence>
          {!uiHidden && (
            <DetailPanel bundle={bundle} queries={queries} data={detailData} />
          )}
        </AnimatePresence>

        {/* Legends — right side, stacked, shift above bottom widgets (Cosmograph only) */}
        {!uiHidden && !isMapLayer && (showColorLegend || showSizeLegend) && (
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

        {/* Geo color legend — custom since Cosmograph legends are gated to non-map layers */}
        {!uiHidden && isMapLayer && showColorLegend && data && (
          <div
            className="absolute right-4 z-30 transition-[bottom] duration-200"
            style={{
              bottom: 16
                + (showTimeline ? TIMELINE_HEIGHT : 0)
                + (tableOpen ? tableHeight : 0),
            }}
          >
            <GeoColorLegend geoNodes={data.geoNodes} />
          </div>
        )}

        {/* Canvas controls (selection tools) — Cosmograph only, MapLibre has no lasso/rectangle select */}
        <AnimatePresence>
          {!uiHidden && panelsVisible && !isMapLayer && <CanvasControls />}
        </AnimatePresence>

        {/* Bottom widgets — overlay on top of graph, pinned to bottom edge */}
        <AnimatePresence>
          {!uiHidden && showTimeline && (
            isMapLayer
              ? (data ? <GeoTimeline geoNodes={data.geoNodes} /> : null)
              : <TimelineBar />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && tableOpen && queries && (
            <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
          )}
        </AnimatePresence>

        {/* Bottom-left toggle bar for timeline & table */}
        {!uiHidden && panelsVisible && <BottomToolbar />}
        {!uiHidden && !isMapLayer && <GraphAttribution />}

        {!uiHidden && <PromptBox bundle={bundle} queries={queries} />}
        {!uiHidden && (layout.showStatsBar || availableLayers.length > 1) && (
          <div className="absolute right-3 top-[52px] z-40 flex flex-col items-end gap-1.5">
            {layout.showStatsBar && stats && (
              <StatsBar stats={stats} />
            )}
            {availableLayers.length > 1 && <LayerSwitcher layers={availableLayers} />}
          </div>
        )}
      </div>
    </GraphShell>
  );
}
