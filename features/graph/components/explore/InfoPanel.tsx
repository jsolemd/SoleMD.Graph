"use client";

import { useEffect, useMemo } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { getActiveLayerData } from "@/features/graph/lib/info-widgets";
import {
  type InfoScope,
  useInfoStats,
} from "@/features/graph/hooks/use-info-stats";
import { buildClusterColors } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { GraphData } from "@/features/graph/types";
import { PanelShell } from "../panels/PanelShell";
import {
  ScopeIndicator,
  OverviewGrid,
  ClusterTable,
  WidgetSlotRenderer,
  AddInsightButton,
  SearchSection,
  SelectionActions,
} from "./info";

export function InfoPanel({ data }: { data: GraphData }) {
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const currentPointIndices = useDashboardStore((s) => s.currentPointIndices);
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (s) => s.activeSelectionSourceId,
  );
  const infoScopeMode = useDashboardStore((s) => s.infoScopeMode);
  const setInfoScopeMode = useDashboardStore((s) => s.setInfoScopeMode);
  const infoWidgets = useDashboardStore((s) => s.infoWidgets);

  // Resolve layer-appropriate nodes for the active layer
  const { nodes: allNodes } = useMemo(
    () => getActiveLayerData(data, activeLayer),
    [data, activeLayer],
  );

  const hasSelection = selectedPointIndices.length > 0;
  const scope: InfoScope =
    infoScopeMode === "selected" && !hasSelection
      ? "current"
      : infoScopeMode;

  useEffect(() => {
    if (infoScopeMode === "selected" && !hasSelection) {
      setInfoScopeMode("current");
    }
  }, [hasSelection, infoScopeMode, setInfoScopeMode]);

  const scopedNodes = useMemo(() => {
    if (scope === "selected") {
      const selectedSet = new Set(selectedPointIndices);
      return allNodes.filter((n) => selectedSet.has(n.index));
    }

    if (scope === "current" && currentPointIndices !== null) {
      const currentSet = new Set(currentPointIndices);
      return allNodes.filter((n) => currentSet.has(n.index));
    }

    return allNodes;
  }, [allNodes, currentPointIndices, scope, selectedPointIndices]);

  const info = useInfoStats(allNodes, scopedNodes, scope);

  // Cluster colors for the table
  const colorTheme = useGraphColorTheme();
  const clusterColors = useMemo(
    () => buildClusterColors(allNodes, colorTheme),
    [allNodes, colorTheme],
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

          {/* Scope badge */}
          <ScopeIndicator
            scopedCount={info.scopedCount}
            totalCount={info.totalCount}
            scope={info.scope}
            isSubset={info.isSubset}
            selectionSource={
              info.scope === "selected" ? activeSelectionSourceId : null
            }
          />

          {/* Dataset overview cards */}
          <OverviewGrid info={info} layer={activeLayer} />

          {/* Top clusters */}
          <ClusterTable
            topClusters={info.topClusters}
            clusterColors={clusterColors}
            scope={info.scope}
          />

          {/* Pluggable widget slots */}
          {infoWidgets.map((slot) => (
            <WidgetSlotRenderer
              key={slot.column}
              slot={slot}
              scopedNodes={scopedNodes}
              allNodes={allNodes}
              scope={info.scope}
            />
          ))}

          {/* Add insight button */}
          <AddInsightButton />

          {/* Search */}
          <SearchSection />

          {/* Selection actions */}
          <SelectionActions scope={info.scope} />
        </Stack>
      </div>
    </PanelShell>
  );
}
