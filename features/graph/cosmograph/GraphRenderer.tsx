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
import { resolveGraphContentContrastLevel } from "@/features/graph/lib/control-contrast";

// Shared label style — point, cluster, and hover labels all use the same treatment
const LABEL_STYLE =
  "background: var(--graph-label-bg); border-radius: 4px; box-shadow: var(--graph-label-shadow); font-weight: 400 !important; text-shadow: 0 0 0.1px currentColor;";

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

  const handleViewportSettled = useCallback(() => {
    handleZoomEnd();

    if (focusedPointIndex != null) {
      markCameraSettled();
    }
  }, [focusedPointIndex, handleZoomEnd, markCameraSettled]);

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

  // Track the logical layer so future active-table versioning or overlay
  // activation does not accidentally trigger a camera reset.
  const lastFittedLayer = useRef<typeof activeLayer | null>(null);

  const handleGraphRebuilt = useCallback(() => {
    const isFirstFit = !hasFittedView.current;
    const isLayerChange = lastFittedLayer.current !== null && lastFittedLayer.current !== activeLayer;

    if (!isFirstFit && !isLayerChange) return;

    hasFittedView.current = true;
    lastFittedLayer.current = activeLayer;

    // Native fitViewOnInit handles the initial fit (configured via props:
    // fitViewDelay=0, fitViewDuration=0, fitViewPadding).  Manual fitView
    // is only needed for layer changes, which the native won't re-trigger.
    if (isLayerChange) {
      cosmographRef.current?.fitView(0, fitViewPadding);
    }

    syncZoomState();
    // Defer onFirstPaint by one frame so the WebGL canvas has rendered
    // the fitted view before the loading overlay starts fading.
    requestAnimationFrame(() => {
      onFirstPaint?.();
    });
    clearVisibilityFocus();
    setFocusedPointIndex(null);
    setCurrentPointScopeSql(null);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
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
    selectedPointCount,
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
    showHoveredPointLabel: config.showHoveredPointLabel,
    hoverLabelAlwaysOn: config.hoverLabelAlwaysOn,
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
        cosmographRef.current?.fitView(0, fitViewPadding);
        hasFittedView.current = true;
        lastFittedLayer.current = activeLayer;
        syncZoomState();
        // Defer onFirstPaint so the WebGL canvas renders the fitted view
        // before the loading overlay starts fading.
        requestAnimationFrame(() => {
          onFirstPaint?.();
        });
      });
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [activeLayer, fitViewPadding, onFirstPaint, syncZoomState]);

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
      fitViewOnInit
      fitViewDelay={0}
      fitViewDuration={0}
      fitViewPadding={fitViewPadding}
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
      renderHoveredPointRing={config.renderHoveredPointRing}
      hoveredPointRingColor={config.colors.ring}
      pointLabelFontSize={11}
      pointLabelColor={config.colors.label}
      pointLabelClassName={LABEL_STYLE}
      clusterLabelClassName={LABEL_STYLE}
      hoveredPointLabelClassName={LABEL_STYLE}
      selectPointOnClick={isLocked ? false : config.hasLinks ? true : "single"}
      selectPointOnLabelClick={isLocked ? false : config.hasLinks ? true : "single"}
      focusPointOnClick={!isLocked}
      focusPointOnLabelClick={!isLocked}
      resetSelectionOnEmptyCanvasClick={!isLocked}
      disableLogging
      onZoomStart={handleZoomStart}
      onZoom={handleZoom}
      onZoomEnd={handleViewportSettled}
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      onBackgroundClick={handleBackgroundClick}
      style={{ position: "relative", width: "100%", height: "100%" }}
    />
    </div>
  );
}
