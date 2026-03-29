"use client";

import { useEffect, useMemo } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { getClusterColor } from "@/features/graph/lib/colors";
import { getActiveLayerData } from "@/features/graph/lib/info-widgets";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import {
  useInfoStats,
  type InfoScope,
} from "@/features/graph/hooks/use-info-stats";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphData } from "@/features/graph/types";
import { PanelShell } from "../../panels/PanelShell";
import {
  ScopeIndicator,
  OverviewGrid,
  ClusterTable,
  WidgetSlotRenderer,
  AddInsightButton,
  SearchSection,
  SelectionActions,
} from "../info";

interface GeoInfoPanelProps {
  data: GraphData;
  queries: GraphBundleQueries;
  overlayCount: number;
}

export function GeoInfoPanel({ data, queries, overlayCount }: GeoInfoPanelProps) {
  const setActivePanel = useDashboardStore((state) => state.setActivePanel);
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentPointIndices = useDashboardStore((state) => state.currentPointIndices);
  const selectedPointIndices = useDashboardStore((state) => state.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (state) => state.activeSelectionSourceId,
  );
  const infoScopeMode = useDashboardStore((state) => state.infoScopeMode);
  const setInfoScopeMode = useDashboardStore((state) => state.setInfoScopeMode);
  const infoWidgets = useDashboardStore((state) => state.infoWidgets);

  const { nodes: allNodes } = useMemo(
    () => getActiveLayerData(data, activeLayer),
    [data, activeLayer],
  );

  const hasSelection = selectedPointIndices.length > 0;
  const scope: InfoScope =
    infoScopeMode === "selected" && !hasSelection ? "current" : infoScopeMode;

  useEffect(() => {
    if (infoScopeMode === "selected" && !hasSelection) {
      setInfoScopeMode("current");
    }
  }, [hasSelection, infoScopeMode, setInfoScopeMode]);

  const scopedNodes = useMemo(() => {
    if (scope === "selected") {
      const selectedSet = new Set(selectedPointIndices);
      return allNodes.filter((node) => selectedSet.has(node.index));
    }

    if (scope === "current" && currentPointIndices !== null) {
      const currentSet = new Set(currentPointIndices);
      return allNodes.filter((node) => currentSet.has(node.index));
    }

    return allNodes;
  }, [allNodes, currentPointIndices, scope, selectedPointIndices]);

  const info = useInfoStats(allNodes, scopedNodes, scope);
  const colorTheme = useGraphColorTheme();
  const clusterColors = useMemo(
    () =>
      Object.fromEntries(
        info.topClusters.map((cluster) => [
          cluster.clusterId,
          getClusterColor(cluster.clusterId, colorTheme),
        ]),
      ),
    [colorTheme, info.topClusters],
  );

  return (
    <PanelShell
      title="Info"
      side="left"
      width={320}
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <Stack gap="md">
          <SegmentedControl
            size="xs"
            fullWidth
            data={[
              { label: "Current", value: "current" },
              {
                label: "Selected",
                value: "selected",
                disabled: !hasSelection,
              },
              { label: "Dataset", value: "dataset" },
            ]}
            value={scope}
            onChange={(value) => setInfoScopeMode(value as typeof infoScopeMode)}
          />

          <ScopeIndicator
            scopedCount={info.scopedCount}
            totalCount={info.totalCount}
            scope={info.scope}
            isSubset={info.isSubset}
            selectionSource={
              info.scope === "selected" ? activeSelectionSourceId : null
            }
          />

          <OverviewGrid info={info} layer={activeLayer} />

          <ClusterTable
            topClusters={info.topClusters}
            clusterColors={clusterColors}
            scope={info.scope}
          />

          {infoWidgets.map((slot) => (
            <WidgetSlotRenderer
              key={slot.column}
              slot={slot}
              scopedNodes={scopedNodes}
              allNodes={allNodes}
              scope={info.scope}
            />
          ))}

          <AddInsightButton />
          <SearchSection key={activeLayer} queries={queries} />
          <SelectionActions
            scope={info.scope}
            queries={queries}
            overlayCount={overlayCount}
          />
        </Stack>
      </div>
    </PanelShell>
  );
}
