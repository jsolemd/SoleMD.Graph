"use client";

import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { useGraphCamera } from "@/features/graph/cosmograph";
import type { InfoScope } from "@/features/graph/hooks/use-info-stats";
import { useDashboardStore } from "@/features/graph/stores";
import { getLayerConfig } from "@/features/graph/lib/layers";
import type { GraphBundleQueries } from "@/features/graph/types";
import { PANEL_ACCENT } from "../../panels/PanelShell";

interface SelectionActionsProps {
  scope: InfoScope;
  queries?: GraphBundleQueries;
}

export function SelectionActions({ scope, queries }: SelectionActionsProps) {
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const selectedPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices,
  );
  const currentPointIndices = useDashboardStore(
    (s) => s.currentPointIndices,
  );
  const currentPointScopeSql = useDashboardStore(
    (s) => s.currentPointScopeSql,
  );
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const mapControls = useDashboardStore((s) => s.mapControls);
  const isMapLayer = getLayerConfig(activeLayer).rendererType === "maplibre";
  const { fitView, fitViewByIndices } = useGraphCamera();
  const [isResolvingCurrentScope, setIsResolvingCurrentScope] = useState(false);

  const handleOpenTable = () => {
    setTableOpen(true);
    setTableView(scope === "selected" ? "selected" : "current");
  };

  const handleFitSelection = async () => {
    if (isMapLayer) {
      mapControls?.fitView();
      return;
    }

    if (scope === "selected" && selectedPointIndices.length > 0) {
      fitViewByIndices(selectedPointIndices, 0, 0.15);
      return;
    }

    if (scope === "current" && currentPointIndices && currentPointIndices.length > 0) {
      fitViewByIndices(currentPointIndices, 0, 0.15);
      return;
    }

    if (
      scope === "current" &&
      currentPointScopeSql &&
      queries
    ) {
      setIsResolvingCurrentScope(true);
      try {
        const indices = await queries.getPointIndicesForScope({
          layer: activeLayer,
          scopeSql: currentPointScopeSql,
        });
        if (indices.length > 0) {
          fitViewByIndices(indices, 0, 0.15);
          return;
        }
      } finally {
        setIsResolvingCurrentScope(false);
      }
    }

    fitView(0, 0.1);
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
        loading={isResolvingCurrentScope}
        onClick={handleFitSelection}
      >
        Fit scope
      </Button>
    </Group>
  );
}
