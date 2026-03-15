"use client";

import { Button, Group } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import type { InfoScope } from "@/lib/graph/hooks/use-info-stats";
import { useDashboardStore } from "@/lib/graph/stores";
import { getLayerConfig } from "@/lib/graph/layers";
import { PANEL_ACCENT } from "../../PanelShell";

interface SelectionActionsProps {
  scope: InfoScope;
}

export function SelectionActions({ scope }: SelectionActionsProps) {
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const selectedPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices,
  );
  const currentPointIndices = useDashboardStore(
    (s) => s.currentPointIndices,
  );
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const mapControls = useDashboardStore((s) => s.mapControls);
  const isMapLayer = getLayerConfig(activeLayer).rendererType === "maplibre";
  const { cosmograph } = useCosmograph();

  const handleOpenTable = () => {
    setTableOpen(true);
    setTableView(scope === "selected" ? "selected" : "current");
  };

  const handleFitSelection = () => {
    if (isMapLayer) {
      mapControls?.fitView();
      return;
    }

    if (scope === "selected" && selectedPointIndices.length > 0) {
      cosmograph?.fitViewByIndices(selectedPointIndices, 0, 0.15);
      return;
    }

    if (scope === "current" && currentPointIndices && currentPointIndices.length > 0) {
      cosmograph?.fitViewByIndices(currentPointIndices, 0, 0.15);
      return;
    }

    cosmograph?.fitView(0, 0.1);
  };

  return (
    <Group grow>
      <Button
        size="compact-xs"
        variant="light"
        color={PANEL_ACCENT}
        onClick={handleOpenTable}
      >
        Open in table
      </Button>
      <Button
        size="compact-xs"
        variant="subtle"
        color={PANEL_ACCENT}
        onClick={handleFitSelection}
      >
        Fit scope
      </Button>
    </Group>
  );
}
