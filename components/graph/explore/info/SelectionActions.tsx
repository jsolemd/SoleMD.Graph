"use client";

import { Button, Group } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import { useDashboardStore } from "@/lib/graph/stores";
import { PANEL_ACCENT } from "../../PanelShell";

interface SelectionActionsProps {
  selectedCount: number;
}

export function SelectionActions({ selectedCount }: SelectionActionsProps) {
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const selectedPointIndices = useDashboardStore(
    (s) => s.selectedPointIndices,
  );
  const filteredPointIndices = useDashboardStore(
    (s) => s.filteredPointIndices,
  );
  const stats = useDashboardStore((s) => s.selectedPointIndices); // read for fitView
  const { cosmograph } = useCosmograph();

  const handleOpenTable = () => {
    setTableOpen(true);
    setTableView(selectedCount > 0 ? "selected" : "visible");
  };

  const handleFitSelection = () => {
    if (selectedCount > 0) {
      cosmograph?.fitViewByIndices(selectedPointIndices, 0, 0.15);
      return;
    }
    if (
      filteredPointIndices &&
      filteredPointIndices.length > 0
    ) {
      cosmograph?.fitViewByIndices(filteredPointIndices, 0, 0.15);
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
        Fit selection
      </Button>
    </Group>
  );
}
