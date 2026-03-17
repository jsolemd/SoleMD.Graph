"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { CosmographSearch } from "@cosmograph/react";
import { ensureCosmographSearchSafeRemove } from "@/features/graph/lib/cosmograph-patches";
import { useDashboardStore } from "@/features/graph/stores";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { sectionLabelStyle } from "../../panels/PanelShell";
import { CosmographWidgetBoundary } from "../../canvas/CosmographWidgetBoundary";

ensureCosmographSearchSafeRemove();

export function SearchSection() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const isSelectionLocked = useDashboardStore((s) => s.lockedSelection !== null);

  const searchFields = useMemo(
    () => getLayerConfig(activeLayer).searchableFields,
    [activeLayer],
  );

  return (
    <div style={{ overflow: "clip" }}>
      <Text fw={600} mb={4} style={sectionLabelStyle}>
        Search
      </Text>
      <CosmographWidgetBoundary>
        <CosmographSearch
          style={{ width: "100%" }}
          accessor="clusterLabel"
          disabled={isSelectionLocked}
          showAccessorsMenu
          showFooter
          preserveSelectionOnUnmount
          placeholderText={
            isSelectionLocked
              ? "Unlock selection to search-select..."
              : "Search points, papers, or clusters..."
          }
          suggestionFields={searchFields}
          suggestionTruncationLength={72}
          onSelectAll={() => {
            setTableOpen(true);
            setTableView("selected");
          }}
        />
      </CosmographWidgetBoundary>
    </div>
  );
}
