"use client";

import { useCallback, useEffect, useState } from "react";
import { useGraphBundle } from "@/features/graph/hooks/use-graph-bundle";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useShallow } from "zustand/react/shallow";
import type { PanelId } from "@/features/graph/stores";
import type { GraphBundle } from "@/features/graph/types";

export interface DashboardShellController {
  bundle: GraphBundle;
  canvas: ReturnType<typeof useGraphBundle>["canvas"];
  canvasShifted: boolean;
  error: Error | null;
  handleGraphFirstPaint: () => void;
  isContinuousColor: boolean;
  isSelectionLocked: boolean;
  loading: boolean;
  openPanels: Record<PanelId, boolean>;
  panelsVisible: boolean;
  progress: ReturnType<typeof useGraphBundle>["progress"];
  queries: ReturnType<typeof useGraphBundle>["queries"];
  showColorLegend: boolean;
  showLoading: boolean;
  showSizeLegend: boolean;
  showTimeline: boolean;
  tableHeight: number;
  tableOpen: boolean;
  uiHidden: boolean;
}

interface DashboardShellSnapshot {
  openPanels: Record<PanelId, boolean>;
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
    openPanels,
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
        openPanels: state.openPanels,
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

  const isReady = !loading && canvas != null && queries != null;
  const showLoading = !isReady || !graphPaintReady;

  return {
    bundle,
    canvas,
    canvasShifted,
    error,
    handleGraphFirstPaint,
    isContinuousColor,
    isSelectionLocked: selectionLocked,
    loading,
    openPanels,
    panelsVisible,
    progress,
    queries,
    showColorLegend,
    showLoading,
    showSizeLegend,
    showTimeline,
    tableHeight,
    tableOpen,
    uiHidden,
  };
}
