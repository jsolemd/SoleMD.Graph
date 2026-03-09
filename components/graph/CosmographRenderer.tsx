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
import type { ChunkNode, GraphData, PointColorStrategy } from "@/lib/graph/types";
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
  const hoverNode = useGraphStore((s) => s.hoverNode);
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colors = isDark ? BRAND.dark : BRAND.light;

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
  const setFilteredPointIndices = useDashboardStore(
    (s) => s.setFilteredPointIndices
  );
  const setSelectedPointIndices = useDashboardStore(
    (s) => s.setSelectedPointIndices
  );
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId
  );

  // When color strategy is "direct" but a non-default scheme is selected,
  // switch to "categorical" because pointColorPalette is ignored in direct mode
  const effectiveColorStrategy: PointColorStrategy = useMemo(() => {
    if (pointColorStrategy === "direct" && colorScheme !== "default") {
      return "categorical";
    }
    return pointColorStrategy;
  }, [pointColorStrategy, colorScheme]);

  const palette = useMemo(() => getPaletteColors(colorScheme), [colorScheme]);

  // Label styling (Cosmograph applies these as inline CSS strings)
  const pointLabelStyle =
    "background: var(--graph-label-bg); border-radius: 4px; box-shadow: var(--graph-label-shadow);";
  const clusterLabelStyle =
    "background: var(--graph-cluster-label-bg); font-weight: 500; border-radius: 4px;";

  // Build index->node map for O(1) lookup in callbacks
  const indexToNode = useMemo(() => {
    const map = new Map<number, ChunkNode>();
    for (const node of data.nodes) {
      map.set(node.index, node);
    }
    return map;
  }, [data.nodes]);

  const idToNode = useMemo(() => {
    const map = new Map<string, ChunkNode>();
    for (const node of data.nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [data.nodes]);

  const allNodeIndices = useMemo(
    () => data.nodes.map((node) => node.index),
    [data.nodes]
  );

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      selectNode(idToNode.get(id) ?? null);
    },
    [idToNode, selectNode]
  );

  const handleGraphRebuilt = useCallback(() => {
    if (!hasFittedView.current) {
      hasFittedView.current = true;
      cosmographRef.current?.fitView(0, 0.1);
      setFilteredPointIndices(allNodeIndices);
      setSelectedPointIndices(cosmographRef.current?.getSelectedPointIndices() ?? []);
      setActiveSelectionSourceId(cosmographRef.current?.getActiveSelectionSourceId() ?? null);
    }
  }, [
    allNodeIndices,
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

  const handlePointMouseOver = useCallback(
    (index: number) => {
      hoverNode(indexToNode.get(index) ?? null);
    },
    [indexToNode, hoverNode]
  );

  const handlePointMouseOut = useCallback(() => {
    hoverNode(null);
  }, [hoverNode]);

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

      if (normalizedSelected.length === 1) {
        selectNode(indexToNode.get(normalizedSelected[0]) ?? null);
        return;
      }

      if (normalizedSelected.length === 0) {
        selectNode(null);
      }
    },
    [
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
      points={canvas.pointsTableName}
      pointIdBy="id"
      pointIndexBy="index"
      pointXBy={positionXColumn}
      pointYBy={positionYColumn}
      pointColorBy={pointColorColumn}
      pointColorStrategy={effectiveColorStrategy}
      pointColorPalette={palette}
      pointSizeBy={pointSizeColumn === "none" ? undefined : pointSizeColumn}
      pointSizeStrategy={pointSizeStrategy}
      pointLabelBy={pointLabelColumn}
      pointLabelWeightBy="clusterProbability"
      pointIncludeColumns={["*"]}
      enableSimulation={false}
      backgroundColor={colors.bg}
      pointSizeRange={pointSizeRange}
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
      onPointMouseOver={handlePointMouseOver}
      onPointMouseOut={handlePointMouseOut}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
