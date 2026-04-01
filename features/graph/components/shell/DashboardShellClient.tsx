"use client";

import { useEffect, useState } from "react";
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
import { GraphBundleErrorState, GraphBundleLoadingOverlay } from "./loading";
import { GraphAttribution, TIMELINE_HEIGHT, BottomToolbar } from "./chrome";
import type { GraphBundle, GraphStats } from "@/features/graph/types";
import {
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
} from "@/features/graph/cosmograph/widgets/dataset-cache";
import { toFacetRowsFromBarCounts } from "@/features/graph/cosmograph/widgets/facet-rows";
import { NATIVE_BARS_DATA_LIMIT } from "@/features/graph/cosmograph/widgets/native-bars-adapter";
import { resolveWidgetBaselineScope } from "@/features/graph/cosmograph/widgets/widget-baseline";

const legendStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
  boxShadow: "var(--graph-panel-shadow)",
  padding: 8,
};

const PREFETCH_FILTER_COUNT = 4;
const DEFERRED_CATEGORICAL_WARM_DELAY_MS = 2500;

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
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const filterColumns = useDashboardStore((s) => s.filterColumns);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const isSelectionLocked = useDashboardStore((s) => s.selectionLocked);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore((s) => s.selectedPointRevision);
  const { canvas, error, loading, progress, queries } = useGraphBundle(bundle);

  const promptMode = useDashboardStore((s) => s.promptMode);
  const promptShellFullHeight = useDashboardStore((s) => s.promptShellFullHeight);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  const canvasShifted = isCreate && (promptMode === "maximized" || promptShellFullHeight);
  const isContinuousColor = pointColorStrategy === "continuous";
  const { scope: baselineScope, cacheKey: baselineCacheKey } = resolveWidgetBaselineScope({
    selectionLocked: isSelectionLocked,
    selectedPointCount,
    selectedPointRevision,
  });

  const setShowTimeline = useDashboardStore((s) => s.setShowTimeline);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const [graphPaintReady, setGraphPaintReady] = useState(false);

  useEffect(() => {
    if (layout.autoShowPanels) setPanelsVisible(true);
    if (layout.autoShowTimeline) setShowTimeline(true);
    if (layout.autoShowTable) setTableOpen(true);
  }, [layout.autoShowPanels, layout.autoShowTimeline, layout.autoShowTable, setPanelsVisible, setShowTimeline, setTableOpen]);

  useEffect(() => {
    setGraphPaintReady(false);
  }, [bundle.bundleChecksum, canvas?.overlayRevision]);

  useEffect(() => {
    if (!queries || !canvas) {
      return;
    }
    if (!graphPaintReady) {
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    let deferredWarmHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    const startupFilters = filterColumns.slice(0, PREFETCH_FILTER_COUNT);
    const startupCategoricalFilters = startupFilters.filter(
      (filter) => filter.type !== "numeric",
    );
    const deferredCategoricalFilters = filterColumns.filter(
      (filter, index) => index >= PREFETCH_FILTER_COUNT && filter.type !== "numeric",
    );
    const startupNumericFilters = startupFilters.filter(
      (filter) => filter.type === "numeric",
    );

    const warmCategoricalFilters = async (
      filters: Array<(typeof filterColumns)[number]>,
    ) => {
      const categoricalFilters = filters.filter((filter) => filter.type !== "numeric");
      if (cancelled || categoricalFilters.length === 0) {
        return;
      }

      const results = await queries.getInfoBarsBatch({
        layer: activeLayer,
        scope: baselineScope,
        columns: categoricalFilters.map((filter) => filter.column),
        maxItems: NATIVE_BARS_DATA_LIMIT,
        currentPointScopeSql: null,
      });

      if (cancelled) {
        return;
      }

      for (const filter of categoricalFilters) {
        const rows = results[filter.column] ?? [];
        setCachedCategoricalDataset(
          getWidgetDatasetCacheKeyWithRevision(
            bundle.bundleChecksum,
            activeLayer,
            filter.column,
            canvas.overlayRevision,
            baselineCacheKey,
          ),
          toFacetRowsFromBarCounts(rows),
        );
      }
    };

    const warmNumericFilters = async (
      filters: Array<(typeof filterColumns)[number]>,
    ) => {
      const numericFilters = filters.filter((filter) => filter.type === "numeric");
      if (cancelled || numericFilters.length === 0) {
        return;
      }

      await Promise.all(
        numericFilters.map(async (filter) => {
          await queries.getInfoHistogram({
            layer: activeLayer,
            scope: baselineScope,
            column: filter.column,
            bins: 20,
            currentPointScopeSql: null,
          });
        }),
      );
    };

    const warmStartupDatasets = async () => {
      await warmCategoricalFilters(startupCategoricalFilters);
      await warmNumericFilters(startupNumericFilters);

      if (cancelled || deferredCategoricalFilters.length === 0) {
        return;
      }

      deferredWarmHandle = globalThis.setTimeout(() => {
        void warmCategoricalFilters(deferredCategoricalFilters);
      }, DEFERRED_CATEGORICAL_WARM_DELAY_MS);
    };

    if (
      startupCategoricalFilters.length === 0 &&
      startupNumericFilters.length === 0 &&
      !showTimeline
    ) {
      return;
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(() => {
        void warmStartupDatasets();
      }, { timeout: 1400 });
    } else {
      timeoutHandle = globalThis.setTimeout(() => {
        void warmStartupDatasets();
      }, 900);
    }

    return () => {
      cancelled = true;
      if (idleHandle != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) {
        globalThis.clearTimeout(timeoutHandle);
      }
      if (deferredWarmHandle != null) {
        globalThis.clearTimeout(deferredWarmHandle);
      }
    };
  }, [
    activeLayer,
    baselineCacheKey,
    baselineScope,
    canvas,
    canvas?.overlayRevision,
    filterColumns,
    graphPaintReady,
    queries,
    showTimeline,
    timelineColumn,
    bundle.bundleChecksum,
  ]);

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  const isReady = !loading && canvas != null && queries != null;
  const showLoading = !isReady || !graphPaintReady;

  const stats: GraphStats | null = canvas
    ? {
        points: canvas.pointCounts.corpus,
        pointLabel: "points",
        papers: 0,
        clusters:
          typeof bundle.qaSummary?.["cluster_count"] === "number"
            ? (bundle.qaSummary["cluster_count"] as number)
            : 0,
        noise:
          typeof bundle.qaSummary?.["noise_count"] === "number"
            ? (bundle.qaSummary["noise_count"] as number)
            : 0,
      }
    : null;

  return (
    <GraphShell>
      <ModeColorSync />
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        {/* Canvas + data-dependent panels — only mount when data available */}
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
                onFirstPaint={() => setGraphPaintReady(true)}
              />
            </div>

            {/* Left panels share one AnimatePresence with mode="wait" so
                switching (e.g. Config → Filters) exits before entering. */}
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
                  bottom: 32
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
              {!uiHidden && panelsVisible && <CanvasControls queries={queries} />}
            </AnimatePresence>

            <AnimatePresence>
              {!uiHidden && showTimeline && (
                <TimelineBar />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {!uiHidden && tableOpen && (
                <DataTable queries={queries} overlayRevision={canvas.overlayRevision} />
              )}
            </AnimatePresence>
          </>
        )}

        {/* Loading overlay — covers canvas until first paint */}
        <AnimatePresence>
          {showLoading && (
            <GraphBundleLoadingOverlay
              bundle={bundle}
              progress={progress}
              canvasReady={isReady}
            />
          )}
        </AnimatePresence>

        <Wordmark />

        <AnimatePresence>
          {!uiHidden && activePanel === "about" && <AboutPanel />}
        </AnimatePresence>

        {/* Chrome — always rendered for stable layout */}
        {!uiHidden && panelsVisible && <BottomToolbar />}
        {!uiHidden && <GraphAttribution />}
        {!uiHidden && <PromptBox bundle={bundle} queries={queries ?? null} />}
        {!uiHidden && layout.showStatsBar && stats != null && (
          <div className="absolute right-3 top-[52px] z-40 flex flex-col items-end gap-1.5">
            <StatsBar stats={stats} />
          </div>
        )}
      </div>
    </GraphShell>
  );
}
