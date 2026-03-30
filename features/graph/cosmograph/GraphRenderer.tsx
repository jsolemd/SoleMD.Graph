"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Cosmograph,
  type CosmographRef,
} from "@cosmograph/react";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import {
  BUDGET_FOCUS_SOURCE_ID,
  buildVisibilityFocusClause,
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import type { GraphBundleQueries } from "@/features/graph/types";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

import { useCosmographConfig } from "./hooks/use-cosmograph-config";
import { useZoomLabels } from "./hooks/use-zoom-labels";
import { usePointsFiltered } from "./hooks/use-points-filtered";
import { resolveGraphLabelMode } from "@/features/graph/lib/label-mode";

// Static label style strings — no need to recreate per render
const POINT_LABEL_STYLE =
  "background: var(--graph-label-bg); border-radius: 4px; box-shadow: var(--graph-label-shadow);";
const CLUSTER_LABEL_STYLE =
  "background: var(--graph-cluster-label-bg); font-weight: 500; border-radius: 4px;";

export default function CosmographRenderer({
  canvas,
  queries,
  onFirstPaint,
}: {
  canvas: GraphCanvasSource;
  queries: GraphBundleQueries;
  onFirstPaint?: () => void;
}) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const hasFittedView = useRef(false);
  const selectionRequestId = useRef(0);
  const budgetFocusSource = useMemo(
    () => createSelectionSource(BUDGET_FOCUS_SOURCE_ID),
    [],
  );
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const focusedPointIndex = useGraphStore((s) => s.focusedPointIndex);
  const setFocusedPointIndex = useGraphStore((s) => s.setFocusedPointIndex);
  const selectNode = useGraphStore((s) => s.selectNode);

  const config = useCosmographConfig(canvas);
  // Destructure values referenced in useCallback deps so the linter can track them
  const {
    activeLayer, fitViewPadding,
  } = config;

  // Selection & interaction state
  const {
    setCurrentPointScopeSql, selectedPointCount,
    setSelectedPointCount,
    setActiveSelectionSourceId, selectionLocked,
    visibilityFocus, clearVisibilityFocus, applyVisibilityBudget,
  } = useDashboardStore(useShallow((s) => ({
    setCurrentPointScopeSql: s.setCurrentPointScopeSql,
    selectedPointCount: s.selectedPointCount,
    setSelectedPointCount: s.setSelectedPointCount,
    setActiveSelectionSourceId: s.setActiveSelectionSourceId,
    selectionLocked: s.selectionLocked,
    visibilityFocus: s.visibilityFocus,
    clearVisibilityFocus: s.clearVisibilityFocus,
    applyVisibilityBudget: s.applyVisibilityBudget,
  })));
  const isLocked = selectionLocked;

  const {
    zoomedIn,
    isActivelyZooming,
    syncZoomState,
    handleZoomStart,
    handleZoom,
    handleZoomEnd,
  } =
    useZoomLabels(cosmographRef);

  const resolveAndSelectNode = useCallback(
    async (selector: { id?: string; index?: number }) => {
      const requestId = ++selectionRequestId.current;
      const node = await queries.resolvePointSelection(activeLayer, selector);

      if (requestId !== selectionRequestId.current) {
        return;
      }

      selectNode(node);
    },
    [activeLayer, queries, selectNode]
  );

  const handleLabelClick = useCallback(
    (index: number, id: string) => {
      setFocusedPointIndex(index);
      void resolveAndSelectNode({ id });
    },
    [resolveAndSelectNode, setFocusedPointIndex]
  );

  // Track the logical layer so future active-table versioning or overlay
  // activation does not accidentally trigger a camera reset.
  const lastFittedLayer = useRef<typeof activeLayer | null>(null);

  const handleGraphRebuilt = useCallback(() => {
    const isFirstFit = !hasFittedView.current;
    const isLayerChange = lastFittedLayer.current !== null && lastFittedLayer.current !== activeLayer;

    if (isFirstFit || isLayerChange) {
      hasFittedView.current = true;
      lastFittedLayer.current = activeLayer;
      cosmographRef.current?.fitView(0, fitViewPadding);
      syncZoomState();
      onFirstPaint?.();
      clearVisibilityFocus();
      setFocusedPointIndex(null);
      setCurrentPointScopeSql(null);
      setSelectedPointCount(0);
      setActiveSelectionSourceId(null);
    }

    if (lastFittedLayer.current === null) {
      lastFittedLayer.current = activeLayer;
      syncZoomState();
      onFirstPaint?.();
    }
  }, [
    activeLayer,
    fitViewPadding,
    onFirstPaint,
    clearVisibilityFocus,
    setFocusedPointIndex,
    setActiveSelectionSourceId,
    setCurrentPointScopeSql,
    setSelectedPointCount,
    syncZoomState,
  ]);

  const handlePointClick = useCallback(
    (index: number) => {
      setFocusedPointIndex(index);
      void resolveAndSelectNode({ index });
    },
    [resolveAndSelectNode, setFocusedPointIndex]
  );

  const handleBackgroundClick = useCallback(() => {
    selectionRequestId.current += 1;
    clearVisibilityFocus();
    setFocusedPointIndex(null);
    selectNode(null);
    // Explicitly clear programmatic selections (selectPoint calls)
    // that resetSelectionOnEmptyCanvasClick may not reach
    cosmographRef.current?.unselectAllPoints();
  }, [clearVisibilityFocus, selectNode, setFocusedPointIndex]);

  useEffect(() => {
    const pointsSelection = cosmographRef.current?.pointsSelection;
    if (!pointsSelection) {
      return;
    }

    if (!visibilityFocus || visibilityFocus.layer !== activeLayer) {
      clearSelectionClause(pointsSelection, budgetFocusSource);
      return;
    }

    pointsSelection.update(
      buildVisibilityFocusClause(budgetFocusSource, visibilityFocus),
    );
  }, [activeLayer, budgetFocusSource, visibilityFocus]);

  const handlePointsFiltered = usePointsFiltered({
    cosmographRef,
    activeLayer,
    selectionLocked,
    visibilityFocus,
    selectNode,
    setCurrentPointScopeSql,
    setSelectedPointCount,
    setActiveSelectionSourceId,
    clearVisibilityFocus,
    applyVisibilityBudget,
    queries,
  });
  const labelMode = resolveGraphLabelMode({
    pointLabelColumn: config.pointLabelColumn,
    showPointLabels: config.showPointLabels,
    showDynamicLabels: config.showDynamicLabels,
    zoomedIn,
    isActivelyZooming,
    hasFocusedPoint: focusedPointIndex != null,
    focusedPointId: selectedNode?.id ?? null,
    hasSelection: selectedPointCount > 0,
  });
  const pointLabelWeightBy =
    labelMode.effectivePointLabelColumn === "clusterLabel"
      ? undefined
      : "paperReferenceCount";

  return (
    <Cosmograph
      ref={cosmographRef}
      duckDBConnection={canvas.duckDBConnection}
      points={config.layerConfig.pointsTable}
      links={config.layerConfig.linksTable}
      pointIdBy="id"
      pointIndexBy="index"
      pointXBy={config.positionXColumn}
      pointYBy={config.positionYColumn}
      pointColorBy={config.effectiveColorColumn}
      pointColorByFn={config.pointColorByFn}
      pointColorStrategy={config.effectiveColorStrategy}
      pointColorPalette={config.palette}
      pointSizeBy={config.pointSizeColumn === "none" ? undefined : config.pointSizeColumn}
      pointSizeStrategy={config.pointSizeStrategy}
      focusedPointIndex={focusedPointIndex ?? undefined}
      pointLabelBy={labelMode.effectivePointLabelColumn}
      pointLabelWeightBy={pointLabelWeightBy}
      showLabelsFor={labelMode.showLabelsFor}
      pointIncludeColumns={
        config.pointIncludeColumns.length > 0 ? config.pointIncludeColumns : undefined
      }
      linkSourceBy={config.layerConfig.linkSourceBy}
      linkSourceIndexBy={config.layerConfig.linkSourceIndexBy}
      linkTargetBy={config.layerConfig.linkTargetBy}
      linkTargetIndexBy={config.layerConfig.linkTargetIndexBy}
      renderLinks={config.hasLinks && (config.renderLinks || selectedPointCount > 0)}
      linkColorByFn={config.hasLinks ? config.linkColorByFn : undefined}
      linkOpacity={config.hasLinks ? config.linkOpacity : undefined}
      linkGreyoutOpacity={config.hasLinks ? (config.renderLinks ? config.linkGreyoutOpacity : 0) : undefined}
      linkVisibilityDistanceRange={config.hasLinks ? config.linkVisibilityDistanceRange : undefined}
      linkVisibilityMinTransparency={config.hasLinks ? config.linkVisibilityMinTransparency : undefined}
      linkDefaultWidth={config.hasLinks ? config.linkDefaultWidth : undefined}
      curvedLinks={config.hasLinks ? config.curvedLinks : undefined}
      linkDefaultArrows={config.hasLinks ? config.linkDefaultArrows : undefined}
      scaleLinksOnZoom={config.hasLinks ? config.scaleLinksOnZoom : undefined}
      enableSimulation={false}
      backgroundColor={config.colors.bg}
      pointSizeRange={config.pointSizeRange}
      pointOpacity={config.effectiveOpacity}
      pointGreyoutOpacity={config.colors.greyout}
      scalePointsOnZoom={config.scalePointsOnZoom}
      showClusterLabels={labelMode.showClusterLabels}
      showLabels={labelMode.showLabels}
      showDynamicLabels={labelMode.showDynamicLabels}
      showTopLabels={labelMode.showTopLabels}
      showSelectedLabels={labelMode.showSelectedLabels}
      showUnselectedPointLabels={labelMode.showUnselectedPointLabels}
      selectedPointLabelsLimit={labelMode.selectedPointLabelsLimit}
      showFocusedPointLabel={labelMode.showFocusedPointLabel}
      pointSamplingDistance={170}
      preservePointPositionsOnDataUpdate
      // Hover labels are still DuckDB-backed natively, so suspend them during
      // camera motion and keep the adapter around Cosmograph itself thin.
      showHoveredPointLabel={config.showHoveredPointLabel && !isActivelyZooming}
      renderHoveredPointRing={config.renderHoveredPointRing}
      hoveredPointRingColor={config.colors.ring}
      pointLabelFontSize={11}
      pointLabelColor={config.colors.label}
      pointLabelClassName={POINT_LABEL_STYLE}
      clusterLabelClassName={CLUSTER_LABEL_STYLE}
      selectPointOnClick={isLocked ? false : config.hasLinks ? true : "single"}
      selectPointOnLabelClick={isLocked ? false : config.hasLinks ? true : "single"}
      focusPointOnClick={!isLocked}
      focusPointOnLabelClick={!isLocked}
      resetSelectionOnEmptyCanvasClick={!isLocked}
      disableLogging
      onZoomStart={handleZoomStart}
      onZoom={handleZoom}
      onZoomEnd={handleZoomEnd}
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      onBackgroundClick={handleBackgroundClick}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
