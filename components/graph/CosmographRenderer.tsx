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
  const bridgedSelectionRef = useRef(false);
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

  // Link visibility — only relevant for layers with a links table
  const hasLinks = Boolean(layerConfig.linksTable);
  const renderLinks = useDashboardStore((s) => s.renderLinks);
  const linkOpacity = useDashboardStore((s) => s.linkOpacity);
  const linkGreyoutOpacity = useDashboardStore((s) => s.linkGreyoutOpacity);
  const linkVisibilityDistanceRange = useDashboardStore((s) => s.linkVisibilityDistanceRange);
  const linkVisibilityMinTransparency = useDashboardStore((s) => s.linkVisibilityMinTransparency);
  const linkDefaultWidth = useDashboardStore((s) => s.linkDefaultWidth);
  const curvedLinks = useDashboardStore((s) => s.curvedLinks);
  const linkDefaultArrows = useDashboardStore((s) => s.linkDefaultArrows);
  const scaleLinksOnZoom = useDashboardStore((s) => s.scaleLinksOnZoom);
  const setFilteredPointIndices = useDashboardStore(
    (s) => s.setFilteredPointIndices
  );
  const setSelectedPointIndices = useDashboardStore(
    (s) => s.setSelectedPointIndices
  );
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId
  );

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
      setFilteredPointIndices(allNodeIndices);
      setSelectedPointIndices(cosmographRef.current?.getSelectedPointIndices() ?? []);
      setActiveSelectionSourceId(cosmographRef.current?.getActiveSelectionSourceId() ?? null);
    }

    if (lastFittedLayer.current === null) {
      lastFittedLayer.current = layerConfig.pointsTable;
    }
  }, [
    allNodeIndices,
    layerConfig.pointsTable,
    setActiveSelectionSourceId,
    setFilteredPointIndices,
    setSelectedPointIndices,
  ]);

  const handlePointClick = useCallback(
    (index: number) => {
      selectNode(indexToNode.get(index) ?? null);
    },
    [indexToNode, selectNode]
  );

  const handlePointsFiltered = useCallback(
    (
      filteredPoints: CosmographData,
      selectedPointIndices: number[] | null | undefined
    ) => {
      const filteredRows =
        cosmographRef.current?.convertCosmographDataToObject(filteredPoints) ?? [];
      const filteredIndices = filteredRows
        .map((row) => row.index)
        .filter((index): index is number => typeof index === "number");
      const normalizedSelected =
        selectedPointIndices?.filter(
          (index): index is number => typeof index === "number"
        ) ?? [];

      setFilteredPointIndices(filteredIndices);
      setSelectedPointIndices(normalizedSelected);
      setActiveSelectionSourceId(cosmographRef.current?.getActiveSelectionSourceId() ?? null);

      // Bridge: crossfilter widget → canvas greyout
      const sourceId = cosmographRef.current?.getActiveSelectionSourceId() ?? null;
      const isFromWidget = sourceId?.startsWith('filter:') || sourceId?.startsWith('timeline:');

      // When a widget re-fires, clear stale bridge first so crossfilter recalculates cleanly
      if (isFromWidget && bridgedSelectionRef.current) {
        bridgedSelectionRef.current = false;
        cosmographRef.current?.unselectAllPoints();
        return; // next callback will re-bridge if filter is still active
      }

      // No canvas selection + partial filter → select filtered points for greyout
      if (normalizedSelected.length === 0 && filteredIndices.length > 0 && filteredIndices.length < allNodeIndices.length) {
        bridgedSelectionRef.current = true;
        cosmographRef.current?.selectPoints(filteredIndices);
      }

      if (normalizedSelected.length === 1) {
        selectNode(indexToNode.get(normalizedSelected[0]) ?? null);
        return;
      }

      if (normalizedSelected.length === 0) {
        selectNode(null);
      }
    },
    [
      allNodeIndices,
      indexToNode,
      selectNode,
      setActiveSelectionSourceId,
      setFilteredPointIndices,
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
      selectPointOnClick="single"
      focusPointOnClick
      resetSelectionOnEmptyCanvasClick
      disableLogging
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
