"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader, Text } from "@mantine/core";
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
import { GraphBundleErrorState } from "./loading";
import { GraphAttribution, TIMELINE_HEIGHT, BottomToolbar } from "./chrome";
import type { GraphBundle, GraphStats } from "@/features/graph/types";
import {
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
  setCachedNumericDataset,
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
const GRAPH_LOADING_LINES = [
  "Placing papers into the canvas.",
  "Settling clusters into their neighborhoods.",
  "Warming filters for the first pass.",
  "Composing the active corpus view.",
];
const GRAPH_LOADING_COPY_INTERVAL_MS = 2200;

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

  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  const canvasShifted = isCreate && !promptMinimized;
  const isContinuousColor = pointColorStrategy === "continuous";
  const { scope: baselineScope, cacheKey: baselineCacheKey } = resolveWidgetBaselineScope({
    selectionLocked: isSelectionLocked,
    selectedPointCount,
    selectedPointRevision,
  });

  const setShowTimeline = useDashboardStore((s) => s.setShowTimeline);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const [graphPaintReady, setGraphPaintReady] = useState(false);
  const [loadingCopyIndex, setLoadingCopyIndex] = useState(0);

  useEffect(() => {
    setLoadingCopyIndex(0);
  }, [bundle.bundleChecksum]);

  useEffect(() => {
    const shouldAnimateCopy = loading || !canvas || !queries || !graphPaintReady;
    if (!shouldAnimateCopy) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      setLoadingCopyIndex((current) => (current + 1) % GRAPH_LOADING_LINES.length);
    }, GRAPH_LOADING_COPY_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(interval);
    };
  }, [canvas, graphPaintReady, loading, queries]);

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

    const warmTimeline = async () => {
      if (cancelled || !showTimeline) {
        return;
      }

      const values = await queries.getNumericValues({
        layer: activeLayer,
        scope: baselineScope,
        column: timelineColumn,
        currentPointScopeSql: null,
      });
      if (!cancelled) {
        setCachedNumericDataset(
          getWidgetDatasetCacheKeyWithRevision(
            bundle.bundleChecksum,
            activeLayer,
            timelineColumn,
            canvas.overlayRevision,
            baselineCacheKey,
          ),
          values,
        );
      }
    };

    const warmStartupDatasets = async () => {
      await warmCategoricalFilters(startupCategoricalFilters);
      await warmNumericFilters(startupNumericFilters);
      await warmTimeline();

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

  const loadingCopy = GRAPH_LOADING_LINES[loadingCopyIndex] ?? GRAPH_LOADING_LINES[0];

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  if (loading || !canvas || !queries) {
    return (
      <GraphShell>
        <ModeColorSync />
        <div
          className="fixed inset-0"
          style={{ backgroundColor: "var(--graph-bg)" }}
        >
          <Wordmark />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader size="sm" color="var(--mode-accent)" />
            <Text size="xs" c="dimmed">
              {loadingCopy}
            </Text>
            {progress?.message ? (
              <Text size="10px" c="dimmed" ta="center" maw={320}>
                {progress.message}
              </Text>
            ) : null}
          </div>
          {!uiHidden && <PromptBox bundle={bundle} queries={null} />}
        </div>
      </GraphShell>
    );
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
          <GraphCanvas
            canvas={canvas}
            queries={queries}
            onFirstPaint={() => setGraphPaintReady(true)}
          />
        </div>

        {!graphPaintReady && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ backgroundColor: "var(--graph-bg)" }}
          >
            <div className="flex flex-col items-center gap-2">
              <Loader size="sm" color="var(--mode-accent)" />
              <Text size="xs" c="dimmed">
                {loadingCopy}
              </Text>
            </div>
          </div>
        )}

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
            <FiltersPanel
              queries={queries}
              bundleChecksum={bundle.bundleChecksum}
              overlayRevision={canvas.overlayRevision}
            />
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
          {!uiHidden && panelsVisible && <CanvasControls queries={queries} />}
        </AnimatePresence>

        <AnimatePresence>
          {!uiHidden && showTimeline && (
            <TimelineBar
              queries={queries}
              bundleChecksum={bundle.bundleChecksum}
              overlayRevision={canvas.overlayRevision}
            />
          )}
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
