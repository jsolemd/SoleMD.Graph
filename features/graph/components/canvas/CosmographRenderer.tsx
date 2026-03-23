"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  Cosmograph,
  type CosmographData,
  type CosmographRef,
} from "@cosmograph/react";
import { useComputedColorScheme } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getPaletteColors } from "@/features/graph/lib/colors";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { GraphData, GraphNode, PointColorStrategy } from "@/features/graph/types";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

import { BRAND } from "@/features/graph/lib/brand-colors";

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

  // Point config — grouped with useShallow to avoid unnecessary re-renders
  const {
    pointColorColumn, pointColorStrategy, colorScheme: colorSchemeName,
    pointSizeColumn, pointSizeRange, pointSizeStrategy, scalePointsOnZoom,
    pointLabelColumn, showPointLabels, showDynamicLabels,
    showHoveredPointLabel, renderHoveredPointRing,
    positionXColumn, positionYColumn,
  } = useDashboardStore(useShallow((s) => ({
    pointColorColumn: s.pointColorColumn,
    pointColorStrategy: s.pointColorStrategy,
    colorScheme: s.colorScheme,
    pointSizeColumn: s.pointSizeColumn,
    pointSizeRange: s.pointSizeRange,
    pointSizeStrategy: s.pointSizeStrategy,
    scalePointsOnZoom: s.scalePointsOnZoom,
    pointLabelColumn: s.pointLabelColumn,
    showPointLabels: s.showPointLabels,
    showDynamicLabels: s.showDynamicLabels,
    showHoveredPointLabel: s.showHoveredPointLabel,
    renderHoveredPointRing: s.renderHoveredPointRing,
    positionXColumn: s.positionXColumn,
    positionYColumn: s.positionYColumn,
  })));

  // Link config — only relevant for layers with meaningful link data
  const hasLinks = layerConfig.hasLinks;
  const {
    renderLinks, linkOpacity, linkGreyoutOpacity,
    linkVisibilityDistanceRange, linkVisibilityMinTransparency,
    linkDefaultWidth, curvedLinks, linkDefaultArrows, scaleLinksOnZoom,
  } = useDashboardStore(useShallow((s) => ({
    renderLinks: s.renderLinks,
    linkOpacity: s.linkOpacity,
    linkGreyoutOpacity: s.linkGreyoutOpacity,
    linkVisibilityDistanceRange: s.linkVisibilityDistanceRange,
    linkVisibilityMinTransparency: s.linkVisibilityMinTransparency,
    linkDefaultWidth: s.linkDefaultWidth,
    curvedLinks: s.curvedLinks,
    linkDefaultArrows: s.linkDefaultArrows,
    scaleLinksOnZoom: s.scaleLinksOnZoom,
  })));

  // Selection & interaction state
  const {
    setCurrentPointIndices, selectedPointIndices,
    setSelectedPointIndices, setHighlightedPointIndices,
    setActiveSelectionSourceId, connectedSelect, lockedSelection,
  } = useDashboardStore(useShallow((s) => ({
    setCurrentPointIndices: s.setCurrentPointIndices,
    selectedPointIndices: s.selectedPointIndices,
    setSelectedPointIndices: s.setSelectedPointIndices,
    setHighlightedPointIndices: s.setHighlightedPointIndices,
    setActiveSelectionSourceId: s.setActiveSelectionSourceId,
    connectedSelect: s.connectedSelect,
    lockedSelection: s.lockedSelection,
  })));
  const isLocked = lockedSelection !== null;

  const colorTheme = useGraphColorTheme();

  // When color strategy is "direct" but a non-default scheme is selected,
  // switch to "categorical" because pointColorPalette is ignored in direct mode
  const effectiveColorStrategy: PointColorStrategy = useMemo(() => {
    if (pointColorStrategy === "direct" && colorSchemeName !== "default") {
      return "categorical";
    }
    return pointColorStrategy;
  }, [pointColorStrategy, colorSchemeName]);

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
    () => getPaletteColors(colorSchemeName, colorTheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorSchemeName, colorTheme, activeLayer, pointColorColumn],
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

  // Auto-scale opacity: sparse graphs stay a touch more opaque so individual
  // points are visible; dense graphs soften further to avoid glare.
  const effectiveOpacity = useMemo(() => {
    const pointCount = activeNodes.length;
    const density = Math.min(Math.log10(Math.max(pointCount, 1)) / Math.log10(50000), 1);
    const baseOpacity = isDark ? 0.7 : 0.5;
    const maxOpacity = isDark ? 0.82 : 0.7;
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

  const allNodeIndices = useMemo(
    () => activeNodes.map((node) => node.index),
    [activeNodes]
  );

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      selectNode(activeNodes.find((n) => n.id === id) ?? null);
    },
    [activeNodes, selectNode]
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

        setHighlightedPointIndices(selectedPointIndices);
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
        selectNode(null);
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
      selectNode,
      selectedPointIndices,
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
      renderLinks={hasLinks && (renderLinks || selectedPointIndices.length > 0)}
      linkOpacity={hasLinks ? linkOpacity : undefined}
      linkGreyoutOpacity={hasLinks ? (renderLinks ? linkGreyoutOpacity : 0) : undefined}
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
      selectPointOnClick={isLocked ? false : hasLinks ? true : "single"}
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
