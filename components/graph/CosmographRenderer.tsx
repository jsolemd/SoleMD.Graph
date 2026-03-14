"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  Cosmograph,
  type CosmographData,
  type CosmographRef,
} from "@cosmograph/react";
import { useComputedColorScheme } from "@mantine/core";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { getPaletteColors } from "@/lib/graph/colors";
import { getLayerConfig } from "@/lib/graph/layers";
import { useGraphColorTheme } from "@/lib/graph/hooks/use-graph-color-theme";
import type { GraphData, GraphNode, PointColorStrategy } from "@/lib/graph/types";
import type { GraphCanvasSource } from "@/lib/graph/duckdb";

import { BRAND } from "@/lib/graph/brand-colors";

export default function CosmographRenderer({
  data,
  canvas,
}: {
  data: GraphData;
  canvas: GraphCanvasSource;
}) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const hasFittedView = useRef(false);
  const selectNode = useGraphStore((s) => s.selectNode);
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colors = isDark ? BRAND.dark : BRAND.light;

  // Active layer — determines which DuckDB table Cosmograph reads from
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);

  // Read config from dashboard store
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const colorScheme = useDashboardStore((s) => s.colorScheme);
  const pointSizeColumn = useDashboardStore((s) => s.pointSizeColumn);
  const pointSizeRange = useDashboardStore((s) => s.pointSizeRange);
  const pointSizeStrategy = useDashboardStore((s) => s.pointSizeStrategy);
  const scalePointsOnZoom = useDashboardStore((s) => s.scalePointsOnZoom);
  const pointLabelColumn = useDashboardStore((s) => s.pointLabelColumn);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const showDynamicLabels = useDashboardStore((s) => s.showDynamicLabels);
  const showHoveredPointLabel = useDashboardStore(
    (s) => s.showHoveredPointLabel
  );
  const renderHoveredPointRing = useDashboardStore(
    (s) => s.renderHoveredPointRing
  );
  const positionXColumn = useDashboardStore((s) => s.positionXColumn);
  const positionYColumn = useDashboardStore((s) => s.positionYColumn);

  // Link visibility — only relevant for layers with meaningful link data
  const hasLinks = layerConfig.hasLinks;
  const renderLinks = useDashboardStore((s) => s.renderLinks);
  const linkOpacity = useDashboardStore((s) => s.linkOpacity);
  const linkGreyoutOpacity = useDashboardStore((s) => s.linkGreyoutOpacity);
  const linkVisibilityDistanceRange = useDashboardStore((s) => s.linkVisibilityDistanceRange);
  const linkVisibilityMinTransparency = useDashboardStore((s) => s.linkVisibilityMinTransparency);
  const linkDefaultWidth = useDashboardStore((s) => s.linkDefaultWidth);
  const curvedLinks = useDashboardStore((s) => s.curvedLinks);
  const linkDefaultArrows = useDashboardStore((s) => s.linkDefaultArrows);
  const scaleLinksOnZoom = useDashboardStore((s) => s.scaleLinksOnZoom);
  const setCurrentPointIndices = useDashboardStore(
    (s) => s.setCurrentPointIndices
  );
  const selectionIntentPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices
  );
  const setSelectedPointIndices = useDashboardStore(
    (s) => s.setSelectedPointIndices
  );
  const setHighlightedPointIndices = useDashboardStore(
    (s) => s.setHighlightedPointIndices
  );
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId
  );
  const connectedSelect = useDashboardStore((s) => s.connectedSelect);
  const lockedSelection = useDashboardStore((s) => s.lockedSelection);
  const isLocked = lockedSelection !== null;

  const colorTheme = useGraphColorTheme();

  // When color strategy is "direct" but a non-default scheme is selected,
  // switch to "categorical" because pointColorPalette is ignored in direct mode
  const effectiveColorStrategy: PointColorStrategy = useMemo(() => {
    if (pointColorStrategy === "direct" && colorScheme !== "default") {
      return "categorical";
    }
    return pointColorStrategy;
  }, [pointColorStrategy, colorScheme]);

  // Use light-mode color column when theme is light and user selected the pre-computed hex color
  const effectiveColorColumn = useMemo(() => {
    if (pointColorColumn === "hexColor" && colorTheme === "light") {
      return "hexColorLight";
    }
    return pointColorColumn;
  }, [pointColorColumn, colorTheme]);

  // Include activeLayer + pointColorColumn so Cosmograph receives a fresh array
  // reference on layer/column switches — without this, Cosmograph skips re-coloring
  // when the palette values haven't changed but the data table has.
  const palette = useMemo(
    () => getPaletteColors(colorScheme, colorTheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorScheme, colorTheme, activeLayer, pointColorColumn],
  );

  // Label styling (Cosmograph applies these as inline CSS strings)
  const pointLabelStyle =
    "background: var(--graph-label-bg); border-radius: 4px; box-shadow: var(--graph-label-shadow);";
  const clusterLabelStyle =
    "background: var(--graph-cluster-label-bg); font-weight: 500; border-radius: 4px;";

  // Derive active node array based on layer
  const activeNodes: GraphNode[] = useMemo(
    () => activeLayer === 'paper' ? data.paperNodes : data.nodes,
    [activeLayer, data.nodes, data.paperNodes]
  );

  // Auto-scale opacity from point count: sparse layers get higher opacity
  // to compensate for lack of WebGL alpha overlap stacking
  const effectiveOpacity = useMemo(() => {
    const pointCount = activeNodes.length;
    const density = Math.min(Math.log10(Math.max(pointCount, 1)) / Math.log10(5000), 1);
    const baseOpacity = isDark ? 0.65 : 0.5;
    const maxOpacity = isDark ? 0.82 : 0.85;
    return maxOpacity - density * (maxOpacity - baseOpacity);
  }, [activeNodes.length, isDark]);

  // Build index->node map for O(1) lookup in callbacks
  const indexToNode = useMemo(() => {
    const map = new Map<number, GraphNode>();
    for (const node of activeNodes) {
      map.set(node.index, node);
    }
    return map;
  }, [activeNodes]);

  const idToNode = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of activeNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [activeNodes]);

  const allNodeIndices = useMemo(
    () => activeNodes.map((node) => node.index),
    [activeNodes]
  );

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      selectNode(idToNode.get(id) ?? null);
    },
    [idToNode, selectNode]
  );

  // Track the layer so we can re-fit view on layer changes
  const lastFittedLayer = useRef<string | null>(null);

  const handleGraphRebuilt = useCallback(() => {
    const isFirstFit = !hasFittedView.current;
    const isLayerChange = lastFittedLayer.current !== null && lastFittedLayer.current !== layerConfig.pointsTable;

    if (isFirstFit || isLayerChange) {
      hasFittedView.current = true;
      lastFittedLayer.current = layerConfig.pointsTable;
      cosmographRef.current?.fitView(0, 0.1);
      setCurrentPointIndices(null);
      setSelectedPointIndices([]);
      setHighlightedPointIndices([]);
      setActiveSelectionSourceId(null);
    }

    if (lastFittedLayer.current === null) {
      lastFittedLayer.current = layerConfig.pointsTable;
    }
  }, [
    layerConfig.pointsTable,
    setActiveSelectionSourceId,
    setCurrentPointIndices,
    setHighlightedPointIndices,
    setSelectedPointIndices,
  ]);

  const handlePointClick = useCallback(
    (index: number) => {
      selectNode(indexToNode.get(index) ?? null);
    },
    [indexToNode, selectNode]
  );

  const handleBackgroundClick = useCallback(() => {
    selectNode(null);
    // Explicitly clear programmatic selections (selectPoint calls)
    // that resetSelectionOnEmptyCanvasClick may not reach
    cosmographRef.current?.unselectAllPoints();
  }, [selectNode]);

  const getIntentClauseIds = useCallback(() => {
    const clauses = cosmographRef.current?.pointsSelection?.clauses ?? [];
    return clauses
      .map((clause) => {
        if (
          typeof clause !== "object" ||
          clause === null ||
          !("source" in clause)
        ) {
          return null;
        }

        const source = clause.source;
        if (
          typeof source !== "object" ||
          source === null ||
          !("id" in source) ||
          typeof source.id !== "string"
        ) {
          return null;
        }

        return source.id;
      })
      .filter(
        (sourceId): sourceId is string =>
          sourceId !== null &&
          !sourceId.startsWith("filter:") &&
          !sourceId.startsWith("timeline:")
      );
  }, []);

  const handlePointsFiltered = useCallback(
    (
      filteredPoints: CosmographData,
      callbackSelectedPointIndices: number[] | null | undefined
    ) => {
      const filteredRows =
        cosmographRef.current?.convertCosmographDataToObject(filteredPoints) ?? [];
      const filteredIndices = filteredRows
        .map((row) => row.index)
        .filter((index): index is number => typeof index === "number");
      const normalizedSelected =
        callbackSelectedPointIndices?.filter(
          (index): index is number => typeof index === "number"
        ) ?? [];
      const sourceId = cosmographRef.current?.getActiveSelectionSourceId() ?? null;
      const isFilterSource =
        sourceId?.startsWith("filter:") || sourceId?.startsWith("timeline:");
      const hasPartialCurrent =
        filteredIndices.length > 0 && filteredIndices.length < allNodeIndices.length;
      const nextHighlight =
        normalizedSelected.length > 0
          ? normalizedSelected
          : hasPartialCurrent
            ? filteredIndices
            : [];
      const hasIntentClauses = getIntentClauseIds().length > 0;
      const pointClauseCount =
        cosmographRef.current?.pointsSelection?.clauses?.length ?? 0;
      const linkClauseCount =
        cosmographRef.current?.linksSelection?.clauses?.length ?? 0;
      const hasCurrentScope = pointClauseCount > 0 || linkClauseCount > 0;

      setCurrentPointIndices(hasCurrentScope ? filteredIndices : null);

      // Locked mode freezes persistent intent and lets filters only alter the
      // currently visible/highlighted subset. Intent-changing widgets should
      // be disabled natively while locked, but this keeps the store resilient.
      if (lockedSelection && lockedSelection.size > 0) {
        if (isFilterSource) {
          setHighlightedPointIndices(nextHighlight);
          return;
        }

        setHighlightedPointIndices(selectionIntentPointIndices);
        return;
      }

      // Filters and timeline always define visibility/highlight only. They never
      // overwrite the user's persistent selection intent.
      if (isFilterSource) {
        setHighlightedPointIndices(nextHighlight);
        return;
      }

      // Non-filter sources update persistent intent only while they still own
      // a live selection clause. This is what prevents "clear selection under
      // active filters" from rehydrating intent from the current intersection.
      if (!hasIntentClauses) {
        setSelectedPointIndices([]);
        setHighlightedPointIndices(nextHighlight);
        setActiveSelectionSourceId(null);
        return;
      }

      setSelectedPointIndices(normalizedSelected);
      setHighlightedPointIndices(normalizedSelected);
      setActiveSelectionSourceId(sourceId);
    },
    [
      allNodeIndices,
      getIntentClauseIds,
      lockedSelection,
      selectionIntentPointIndices,
      setActiveSelectionSourceId,
      setCurrentPointIndices,
      setHighlightedPointIndices,
      setSelectedPointIndices,
    ]
  );

  return (
    <Cosmograph
      ref={cosmographRef}
      duckDBConnection={canvas.duckDBConnection}
      points={layerConfig.pointsTable}
      links={layerConfig.linksTable}
      pointIdBy="id"
      pointIndexBy="index"
      pointXBy={positionXColumn}
      pointYBy={positionYColumn}
      pointColorBy={effectiveColorColumn}
      pointColorStrategy={effectiveColorStrategy}
      pointColorPalette={palette}
      pointSizeBy={pointSizeColumn === "none" ? undefined : pointSizeColumn}
      pointSizeStrategy={pointSizeStrategy}
      pointLabelBy={pointLabelColumn}
      pointLabelWeightBy="clusterProbability"
      pointIncludeColumns={["*"]}
      linkSourceBy={layerConfig.linkSourceBy}
      linkSourceIndexBy={layerConfig.linkSourceIndexBy}
      linkTargetBy={layerConfig.linkTargetBy}
      linkTargetIndexBy={layerConfig.linkTargetIndexBy}
      linkIncludeColumns={hasLinks ? ["*"] : undefined}
      renderLinks={hasLinks && renderLinks}
      linkOpacity={hasLinks ? linkOpacity : undefined}
      linkGreyoutOpacity={hasLinks ? linkGreyoutOpacity : undefined}
      linkVisibilityDistanceRange={hasLinks ? linkVisibilityDistanceRange : undefined}
      linkVisibilityMinTransparency={hasLinks ? linkVisibilityMinTransparency : undefined}
      linkDefaultWidth={hasLinks ? linkDefaultWidth : undefined}
      curvedLinks={hasLinks ? curvedLinks : undefined}
      linkDefaultArrows={hasLinks ? linkDefaultArrows : undefined}
      scaleLinksOnZoom={hasLinks ? scaleLinksOnZoom : undefined}
      enableSimulation={false}
      backgroundColor={colors.bg}
      pointSizeRange={pointSizeRange}
      pointOpacity={effectiveOpacity}
      pointGreyoutOpacity={colors.greyout}
      scalePointsOnZoom={scalePointsOnZoom}
      showLabels={showPointLabels}
      showDynamicLabels={showDynamicLabels}
      showTopLabels={showPointLabels}
      showDynamicLabelsLimit={30}
      showTopLabelsLimit={20}
      showSelectedLabels
      showUnselectedPointLabels={false}
      selectedPointLabelsLimit={60}
      showHoveredPointLabel={showHoveredPointLabel}
      renderHoveredPointRing={renderHoveredPointRing}
      hoveredPointRingColor={colors.ring}
      pointLabelFontSize={11}
      pointLabelColor={colors.label}
      pointLabelClassName={pointLabelStyle}
      clusterLabelClassName={clusterLabelStyle}
      selectPointOnClick={isLocked ? false : (hasLinks && connectedSelect) ? true : "single"}
      focusPointOnClick={!isLocked}
      resetSelectionOnEmptyCanvasClick={!isLocked}
      disableLogging
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      onBackgroundClick={handleBackgroundClick}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
