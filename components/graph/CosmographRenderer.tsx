"use client";

import { useCallback, useMemo, useRef } from "react";
import { Cosmograph } from "@cosmograph/react";
import type { CosmographRef } from "@cosmograph/react";
import { useComputedColorScheme } from "@mantine/core";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { getPaletteColors } from "@/lib/graph/colors";
import type { ChunkNode, GraphData, PointColorStrategy } from "@/lib/graph/types";

// Brand color constants for Cosmograph config props (WebGL needs actual values, not CSS vars)
const BRAND = {
  light: { bg: "#f8f9fa", ring: "#747caa", label: "#1a1b1e", greyout: 0.25 },
  dark: { bg: "#111113", ring: "#a8c5e9", label: "#e4e4e9", greyout: 0.15 },
} as const;

export default function CosmographRenderer({ data }: { data: GraphData }) {
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

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      const node = data.nodes.find((n) => n.id === id) ?? null;
      selectNode(node);
    },
    [data.nodes, selectNode]
  );

  const handleGraphRebuilt = useCallback(() => {
    if (!hasFittedView.current) {
      hasFittedView.current = true;
      cosmographRef.current?.fitView(0);
    }
  }, []);

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

  const points = useMemo(
    () => data.nodes.map((n) => ({ ...n }) as Record<string, unknown>),
    [data.nodes]
  );

  return (
    <Cosmograph
      ref={cosmographRef}
      points={points}
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
      showDynamicLabelsLimit={30}
      showTopLabelsLimit={20}
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
      onPointClick={handlePointClick}
      onPointMouseOver={handlePointMouseOver}
      onPointMouseOut={handlePointMouseOut}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
