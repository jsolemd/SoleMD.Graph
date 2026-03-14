"use client";

import { useMemo } from "react";
import { Text } from "@mantine/core";
import { CosmographSearch } from "@cosmograph/react";
import { ensureCosmographSearchSafeRemove } from "@/lib/graph/cosmograph-patches";
import { useDashboardStore } from "@/lib/graph/stores";
import { getLayerConfig } from "@/lib/graph/layers";
import { sectionLabelStyle } from "../../PanelShell";
import { CosmographWidgetBoundary } from "../../CosmographWidgetBoundary";

ensureCosmographSearchSafeRemove();

export function SearchSection() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);

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
          showAccessorsMenu
          showFooter
          preserveSelectionOnUnmount
          placeholderText="Search points, papers, or clusters..."
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
