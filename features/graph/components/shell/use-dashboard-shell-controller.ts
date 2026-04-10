"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphBundle } from "@/features/graph/hooks/use-graph-bundle";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useShallow } from "zustand/react/shallow";
import type { GraphBundle, GraphStats } from "@/features/graph/types";

export interface DashboardShellController {
  activePanel: ReturnType<typeof useDashboardStore.getState>["activePanel"];
  bundle: GraphBundle;
  canvas: ReturnType<typeof useGraphBundle>["canvas"];
  canvasShifted: boolean;
  error: Error | null;
  handleGraphFirstPaint: () => void;
  isContinuousColor: boolean;
  isSelectionLocked: boolean;
  layoutShowStatsBar: boolean;
  loading: boolean;
  panelsVisible: boolean;
  progress: ReturnType<typeof useGraphBundle>["progress"];
  queries: ReturnType<typeof useGraphBundle>["queries"];
  showColorLegend: boolean;
  showLoading: boolean;
  showSizeLegend: boolean;
  showTimeline: boolean;
  stats: GraphStats | null;
  tableHeight: number;
  tableOpen: boolean;
  uiHidden: boolean;
}

interface DashboardShellSnapshot {
  activePanel: ReturnType<typeof useDashboardStore.getState>["activePanel"];
  panelsVisible: boolean;
  pointColorStrategy: ReturnType<
    typeof useDashboardStore.getState
  >["pointColorStrategy"];
  promptMode: ReturnType<typeof useDashboardStore.getState>["promptMode"];
  promptShellFullHeight: boolean;
  selectionLocked: boolean;
  setPanelsVisible: ReturnType<typeof useDashboardStore.getState>["setPanelsVisible"];
  setShowTimeline: ReturnType<typeof useDashboardStore.getState>["setShowTimeline"];
  setTableOpen: ReturnType<typeof useDashboardStore.getState>["setTableOpen"];
  showColorLegend: boolean;
  showSizeLegend: boolean;
  showTimeline: boolean;
  tableHeight: number;
  tableOpen: boolean;
  uiHidden: boolean;
}

export function useDashboardShellController(bundle: GraphBundle): DashboardShellController {
  const mode = useGraphStore((state) => state.mode);
  const {
    activePanel,
    panelsVisible,
    pointColorStrategy,
    promptMode,
    promptShellFullHeight,
    selectionLocked,
    setPanelsVisible,
    setShowTimeline,
    setTableOpen,
    showColorLegend,
    showSizeLegend,
    showTimeline,
    tableHeight,
    tableOpen,
    uiHidden,
  } = useDashboardStore(
    useShallow(
      (state): DashboardShellSnapshot => ({
        activePanel: state.activePanel,
        panelsVisible: state.panelsVisible,
        pointColorStrategy: state.pointColorStrategy,
        promptMode: state.promptMode,
        promptShellFullHeight: state.promptShellFullHeight,
        selectionLocked: state.selectionLocked,
        setPanelsVisible: state.setPanelsVisible,
        setShowTimeline: state.setShowTimeline,
        setTableOpen: state.setTableOpen,
        showColorLegend: state.showColorLegend,
        showSizeLegend: state.showSizeLegend,
        showTimeline: state.showTimeline,
        tableHeight: state.tableHeight,
        tableOpen: state.tableOpen,
        uiHidden: state.uiHidden,
      }),
    ),
  );
  const { canvas, error, loading, progress, queries } = useGraphBundle(bundle);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  const canvasShifted = isCreate && (promptMode === "maximized" || promptShellFullHeight);
  const isContinuousColor = pointColorStrategy === "continuous";
  const [graphPaintReady, setGraphPaintReady] = useState(false);
  const handleGraphFirstPaint = useCallback(() => {
    setGraphPaintReady(true);
  }, []);

  useEffect(() => {
    if (layout.autoShowPanels) {
      setPanelsVisible(true);
    }
    if (layout.autoShowTimeline) {
      setShowTimeline(true);
    }
    if (layout.autoShowTable) {
      setTableOpen(true);
    }
  }, [
    layout.autoShowPanels,
    layout.autoShowTable,
    layout.autoShowTimeline,
    setPanelsVisible,
    setShowTimeline,
    setTableOpen,
  ]);

  useEffect(() => {
    setGraphPaintReady(false);
  }, [bundle.bundleChecksum, canvas?.overlayRevision]);

  const stats: GraphStats | null = useMemo(() => {
    if (!canvas) {
      return null;
    }

    return {
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
    };
  }, [bundle.qaSummary, canvas]);

  const isReady = !loading && canvas != null && queries != null;
  const showLoading = !isReady || !graphPaintReady;

  return {
    activePanel,
    bundle,
    canvas,
    canvasShifted,
    error,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked: selectionLocked,
    layoutShowStatsBar: layout.showStatsBar,
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
  };
}
