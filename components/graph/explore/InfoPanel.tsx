"use client";

import { useMemo } from "react";
import { Stack } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/stores";
import { getActiveLayerData } from "@/lib/graph/info-widgets";
import { useInfoStats } from "@/lib/graph/hooks/use-info-stats";
import { buildClusterColors } from "@/lib/graph/colors";
import { useGraphColorTheme } from "@/lib/graph/hooks/use-graph-color-theme";
import type { GraphData } from "@/lib/graph/types";
import { PanelShell } from "../PanelShell";
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
  const selectedPointIndices = useDashboardStore((s) => s.selectedPointIndices);
  const activeSelectionSourceId = useDashboardStore(
    (s) => s.activeSelectionSourceId,
  );
  const infoWidgets = useDashboardStore((s) => s.infoWidgets);

  // Resolve layer-appropriate nodes + stats
  const { nodes: allNodes, stats } = useMemo(
    () => getActiveLayerData(data, activeLayer),
    [data, activeLayer],
  );

  // Single source of truth: selection is active when selectedPointIndices is non-empty.
  // This boolean is threaded to every sub-component — no component should infer
  // selection state from reference identity or array length comparisons.
  const hasSelection = selectedPointIndices.length > 0;

  // Scope: selection or full dataset
  const scopedNodes = useMemo(() => {
    if (!hasSelection) return allNodes;
    const selectedSet = new Set(selectedPointIndices);
    return allNodes.filter((n) => selectedSet.has(n.index));
  }, [allNodes, selectedPointIndices, hasSelection]);

  const info = useInfoStats(allNodes, scopedNodes, activeLayer, stats, hasSelection);

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
          {/* Scope badge */}
          <ScopeIndicator
            scopedCount={info.scopedCount}
            totalCount={info.totalCount}
            hasSelection={info.hasSelection}
            selectionSource={activeSelectionSourceId}
          />

          {/* Dataset overview cards */}
          <OverviewGrid info={info} layer={activeLayer} />

          {/* Top clusters */}
          <ClusterTable
            topClusters={info.topClusters}
            clusterColors={clusterColors}
            hasSelection={info.hasSelection}
          />

          {/* Pluggable widget slots */}
          {infoWidgets.map((slot) => (
            <WidgetSlotRenderer
              key={slot.column}
              slot={slot}
              scopedNodes={scopedNodes}
              allNodes={allNodes}
              hasSelection={hasSelection}
            />
          ))}

          {/* Add insight button */}
          <AddInsightButton />

          {/* Search */}
          <SearchSection />

          {/* Selection actions */}
          <SelectionActions selectedCount={selectedPointIndices.length} />
        </Stack>
      </div>
    </PanelShell>
  );
}
