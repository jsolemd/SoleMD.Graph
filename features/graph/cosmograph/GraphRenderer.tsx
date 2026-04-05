"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import {
  Cosmograph,
  type CosmographRef,
} from "@cosmograph/react";
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
import {
  NATIVE_COSMOGRAPH_LABEL_THEME_CSS,
  resolveClusterLabelClassName,
} from "./label-appearance";
import { resolveGraphLabelMode } from "@/features/graph/lib/label-mode";
import { resolveGraphContentContrastLevel } from "@/features/graph/lib/control-contrast";

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
  const markCameraSettled = useGraphStore((s) => s.markCameraSettled);
  const setGraphContentContrastLevel = useGraphStore(
    (s) => s.setGraphContentContrastLevel,
  );
  const setZoomedIn = useGraphStore((s) => s.setZoomedIn);
  const selectNode = useGraphStore((s) => s.selectNode);

  const config = useCosmographConfig(canvas);
  // Destructure values referenced in useCallback deps so the linter can track them
  const {
    activeLayer, fitViewPadding,
  } = config;

  // Selection & interaction state — individual selectors avoid useShallow's
  // per-render object allocation and prevent Cosmograph re-diffs on unrelated
  // store changes.  hasSelection is a derived boolean (not the raw count) so
  // the renderer only re-renders when selection starts or ends, not during
  // a lasso drag that changes count from 50k to 200k.
  const hasSelection = useDashboardStore((s) => s.selectedPointCount > 0);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const connectedSelect = useDashboardStore((s) => s.connectedSelect);
  const visibilityFocus = useDashboardStore((s) => s.visibilityFocus);
  const setCurrentPointScopeSql = useDashboardStore((s) => s.setCurrentPointScopeSql);
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const applyVisibilityBudget = useDashboardStore((s) => s.applyVisibilityBudget);
  const isLocked = selectionLocked;

  const {
    zoomedIn,
    syncZoomState,
    handleZoom,
  } =
    useZoomLabels(cosmographRef);

  const handleViewportSettled = useCallback(() => {
    syncZoomState();

    if (focusedPointIndex != null) {
      markCameraSettled();
    }
  }, [focusedPointIndex, markCameraSettled, syncZoomState]);

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
      if (focusedPointIndex !== index) {
        setFocusedPointIndex(index);
      }
      if (selectedNode?.id === id && selectedNode.index === index) {
        return;
      }
      void resolveAndSelectNode({ id });
    },
    [focusedPointIndex, resolveAndSelectNode, selectedNode, setFocusedPointIndex]
  );

  const handleClusterLabelClick = useCallback(() => {
    // Cluster-label clicks promote a multi-point selection. Clear any stale
    // single-point detail state and let onPointsFiltered persist the selection.
    if (focusedPointIndex != null) {
      setFocusedPointIndex(null);
    }
    if (selectedNode != null) {
      selectNode(null);
    }
  }, [focusedPointIndex, selectNode, selectedNode, setFocusedPointIndex]);

  // Track the logical layer so future active-table versioning or overlay
  // activation does not accidentally trigger a camera reset.
  const lastFittedLayer = useRef<typeof activeLayer | null>(null);
  const signalFirstPaint = useCallback(() => {
    requestAnimationFrame(() => {
      onFirstPaint?.();
    });
  }, [onFirstPaint]);

  const fitViewport = useCallback(
    (layer: typeof activeLayer) => {
      cosmographRef.current?.fitView(0, fitViewPadding);
      hasFittedView.current = true;
      lastFittedLayer.current = layer;
      syncZoomState();
      signalFirstPaint();
    },
    [fitViewPadding, signalFirstPaint, syncZoomState],
  );

  const handleGraphRebuilt = useCallback(() => {
    const isFirstFit = !hasFittedView.current;
    const isLayerChange = lastFittedLayer.current !== null && lastFittedLayer.current !== activeLayer;

    if (!isFirstFit && !isLayerChange) return;

    // Native fitViewOnInit can reveal Cosmograph's default zoom for a frame
    // before the fitted transform lands. Apply the fit explicitly so the
    // loading overlay drops only after the correct camera state is in place.
    fitViewport(activeLayer);
    clearVisibilityFocus();
    setFocusedPointIndex(null);
    setCurrentPointScopeSql(null);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
  }, [
    activeLayer,
    clearVisibilityFocus,
    fitViewport,
    setFocusedPointIndex,
    setActiveSelectionSourceId,
    setCurrentPointScopeSql,
    setSelectedPointCount,
  ]);

  const handlePointClick = useCallback(
    (index: number) => {
      if (focusedPointIndex !== index) {
        setFocusedPointIndex(index);
      }
      if (selectedNode?.index === index) {
        return;
      }
      void resolveAndSelectNode({ index });
    },
    [focusedPointIndex, resolveAndSelectNode, selectedNode, setFocusedPointIndex]
  );

  const handleBackgroundClick = useCallback(() => {
    selectionRequestId.current += 1;
    if (isLocked) {
      setFocusedPointIndex(null);
      selectNode(null);
      return;
    }

    clearVisibilityFocus();
    setFocusedPointIndex(null);
    selectNode(null);
    // Explicitly clear programmatic selections (selectPoint calls)
    // that resetSelectionOnEmptyCanvasClick may not reach
    cosmographRef.current?.unselectAllPoints();
  }, [clearVisibilityFocus, isLocked, selectNode, setFocusedPointIndex]);

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
    hasSelection,
    visibilityFocus,
    selectNode,
    setCurrentPointScopeSql,
    setSelectedPointCount,
    setActiveSelectionSourceId,
    clearVisibilityFocus,
    applyVisibilityBudget,
    queries,
  });
  // Defer hasSelection for label-mode so Cosmograph processes the selection
  // highlight first (greying out / dot coloring) and the 7+ label prop changes
  // arrive in the next concurrent render — eliminating a multi-prop re-diff
  // that stalls the WebGL pipeline.
  const deferredHasSelection = useDeferredValue(hasSelection);
  const labelMode = resolveGraphLabelMode({
    pointLabelColumn: config.pointLabelColumn,
    showPointLabels: config.showPointLabels,
    showDynamicLabels: config.showDynamicLabels,
    showHoveredPointLabel: config.showHoveredPointLabel,
    hoverLabelAlwaysOn: config.hoverLabelAlwaysOn,
    zoomedIn,
    hasFocusedPoint: focusedPointIndex != null,
    focusedPointId: selectedNode?.id ?? null,
    hasSelection: deferredHasSelection,
  });
  const pointLabelWeightBy =
    labelMode.effectivePointLabelColumn === "clusterLabel"
      ? undefined
      : "paperReferenceCount";
  const graphContentContrastLevel = resolveGraphContentContrastLevel({
    showLabels: labelMode.showLabels,
    showDynamicLabels: labelMode.showDynamicLabels,
    showTopLabels: labelMode.showTopLabels,
  });

  useEffect(() => {
    setGraphContentContrastLevel(graphContentContrastLevel);

    return () => {
      setGraphContentContrastLevel(0);
    };
  }, [graphContentContrastLevel, setGraphContentContrastLevel]);

  useEffect(() => {
    setZoomedIn(zoomedIn);
  }, [zoomedIn, setZoomedIn]);

  // Cosmograph's onGraphRebuilt fires after the first RAF-driven paint.
  // When the tab is backgrounded during load, RAF is paused so the callback
  // never fires and the loading overlay stays forever.  Retry on visibility.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible" || hasFittedView.current) {
        return;
      }
      // Give Cosmograph one frame to paint now that RAF is active again
      requestAnimationFrame(() => {
        if (hasFittedView.current) {
          return;
        }
        fitViewport(activeLayer);
      });
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [activeLayer, fitViewport]);

  // The CSS filter on [data-graph-canvas] canvas creates a stacking context
  // that paints the WebGL canvas above the d3-brush SVG overlay, blocking
  // rect/poly selection.  Elevate the brush SVG so it stacks on top.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = wrapperRef.current;
    if (!container) return;
    const brushSvg = container.querySelector<SVGSVGElement>("svg");
    if (brushSvg?.querySelector(".brush-group")) {
      brushSvg.style.zIndex = "2";
    }
  }, []);

  // data-graph-canvas drives the CSS rule in globals.css that applies
  // --graph-canvas-filter to the <canvas> only (not labels).  In light mode
  // the WebGL background is transparent so the filter only hits colored points;
  // the visible background lives on the sibling div behind the canvas.
  return (
    <div ref={wrapperRef} data-graph-canvas style={{ position: "relative", width: "100%", height: "100%" }}>
    <style data-graph-label-theme="native-adapter">
      {NATIVE_COSMOGRAPH_LABEL_THEME_CSS}
    </style>
    {/* Theme background — unaffected by the canvas CSS filter */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: config.colors.bg,
        transition: "background 80ms ease-out",
        pointerEvents: "none",
      }}
    />
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
      pointClusterBy={config.pointClusterColumn}
      showLabelsFor={labelMode.showLabelsFor}
      pointIncludeColumns={
        config.pointIncludeColumns.length > 0 ? config.pointIncludeColumns : undefined
      }
      linkSourceBy={config.layerConfig.linkSourceBy}
      linkSourceIndexBy={config.layerConfig.linkSourceIndexBy}
      linkTargetBy={config.layerConfig.linkTargetBy}
      linkTargetIndexBy={config.layerConfig.linkTargetIndexBy}
      renderLinks={config.hasLinks && config.renderLinks}
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
      backgroundColor={config.isDark ? config.colors.bg : "transparent"}
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
      showHoveredPointLabel={labelMode.showHoveredPointLabel}
      hoveredPointLabelClassName=""
      renderHoveredPointRing={config.renderHoveredPointRing}
      hoveredPointRingColor={config.colors.ring}
      pointLabelFontSize={11}
      usePointColorStrategyForClusterLabels={config.pointClusterColumn != null}
      clusterLabelClassName={resolveClusterLabelClassName}
      selectClusterOnLabelClick={!isLocked}
      selectPointOnClick={
        isLocked ? false : config.hasLinks && connectedSelect ? true : "single"
      }
      selectPointOnLabelClick={
        isLocked ? false : config.hasLinks && connectedSelect ? true : "single"
      }
      focusPointOnClick={!isLocked}
      focusPointOnLabelClick={!isLocked}
      resetSelectionOnEmptyCanvasClick={!isLocked}
      disableLogging
      onZoom={handleZoom}
      onZoomEnd={handleViewportSettled}
      onLabelClick={handleLabelClick}
      onClusterLabelClick={handleClusterLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      onBackgroundClick={handleBackgroundClick}
      style={{ position: "relative", width: "100%", height: "100%" }}
    />
    </div>
  );
}
