"use client";

import { useCallback, useMemo, useRef } from "react";
import { Cosmograph } from "@cosmograph/react";
import type { CosmographRef } from "@cosmograph/react";
import { useComputedColorScheme } from "@mantine/core";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import type { GraphData } from "@/lib/graph/types";

export default function CosmographRenderer({ data }: { data: GraphData }) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const hasFittedView = useRef(false);
  const selectNode = useGraphStore((s) => s.selectNode);
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";

  // Read config from dashboard store
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const pointSizeColumn = useDashboardStore((s) => s.pointSizeColumn);
  const pointSizeRange = useDashboardStore((s) => s.pointSizeRange);
  const pointLabelColumn = useDashboardStore((s) => s.pointLabelColumn);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const showDynamicLabels = useDashboardStore((s) => s.showDynamicLabels);
  const positionXColumn = useDashboardStore((s) => s.positionXColumn);
  const positionYColumn = useDashboardStore((s) => s.positionYColumn);

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      const node = data.nodes.find((n) => n.id === id) ?? null;
      selectNode(node);
    },
    [data.nodes, selectNode]
  );

  const handleGraphRebuilt = useCallback(
    () => {
      if (!hasFittedView.current) {
        hasFittedView.current = true;
        cosmographRef.current?.fitView(0);
      }
    },
    []
  );

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
      pointColorStrategy={pointColorStrategy as "direct"}
      pointSizeBy={pointSizeColumn === "none" ? undefined : pointSizeColumn}
      pointLabelBy={pointLabelColumn}
      pointLabelWeightBy="clusterProbability"
      pointIncludeColumns={["*"]}
      enableSimulation={false}
      backgroundColor={isDark ? "#0a0a0f" : "#f8f9fa"}
      pointSizeRange={pointSizeRange}
      pointGreyoutOpacity={isDark ? 0.15 : 0.25}
      showLabels={showPointLabels}
      showDynamicLabels={showDynamicLabels}
      showDynamicLabelsLimit={30}
      showTopLabelsLimit={20}
      pointLabelFontSize={11}
      pointLabelColor={isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)"}
      selectPointOnClick="single"
      focusPointOnClick
      resetSelectionOnEmptyCanvasClick
      disableLogging
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
