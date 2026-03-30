"use client";

import { useState } from "react";
import { Button, Group, Stack } from "@mantine/core";
import { useGraphCamera } from "@/features/graph/cosmograph";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoScope } from "@/features/graph/types";
import { PANEL_ACCENT } from "../../panels/PanelShell";

interface SelectionActionsProps {
  scope: GraphInfoScope;
  queries?: GraphBundleQueries;
  overlayCount?: number;
}

export function SelectionActions({
  scope,
  queries,
  overlayCount = 0,
}: SelectionActionsProps) {
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const currentPointScopeSql = useDashboardStore(
    (s) => s.currentPointScopeSql,
  );
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const { fitView, fitViewByCoordinates } = useGraphCamera();
  const [isResolvingCurrentScope, setIsResolvingCurrentScope] = useState(false);
  const [isActivatingOverlay, setIsActivatingOverlay] = useState(false);
  const [isClearingOverlay, setIsClearingOverlay] = useState(false);

  const hasCurrentSubset =
    Boolean(currentPointScopeSql && currentPointScopeSql.trim().length > 0);
  const canActivateOverlay =
    Boolean(queries) &&
    ((scope === "selected" && selectedPointCount > 0) ||
      (scope === "current" && hasCurrentSubset));

  const handleOpenTable = () => {
    setTableOpen(true);
    setTableView(scope === "dataset" ? "dataset" : "selection");
  };

  const handleFitSelection = async () => {
    if (queries && (scope === "selected" || scope === "current")) {
      setIsResolvingCurrentScope(true);
      try {
        const coordinates = await queries.getScopeCoordinates({
          layer: activeLayer,
          scope,
          currentPointScopeSql,
        });
        if (coordinates && coordinates.length > 0) {
          fitViewByCoordinates(coordinates, 0, 0.15);
          return;
        }
      } finally {
        setIsResolvingCurrentScope(false);
      }
    }

    fitView(0, 0.1);
  };

  const handleActivateOverlay = async () => {
    if (!queries || !canActivateOverlay) {
      return;
    }

    setIsActivatingOverlay(true);
    try {
      await queries.activateOverlay({
        kind: "cluster-neighborhood",
        layer: activeLayer,
        scope: scope === "selected" ? "selected" : "current",
        currentPointScopeSql,
      });
    } finally {
      setIsActivatingOverlay(false);
    }
  };

  const handleClearOverlay = async () => {
    if (!queries || overlayCount === 0) {
      return;
    }

    setIsClearingOverlay(true);
    try {
      await queries.clearOverlay();
    } finally {
      setIsClearingOverlay(false);
    }
  };

  return (
    <Stack gap="xs">
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
      <Group grow>
        <Button
          size="compact-xs"
          variant="subtle"
          color={PANEL_ACCENT}
          loading={isActivatingOverlay}
          disabled={!canActivateOverlay}
          onClick={handleActivateOverlay}
        >
          Expand overlay
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          color={PANEL_ACCENT}
          loading={isClearingOverlay}
          disabled={overlayCount === 0}
          onClick={handleClearOverlay}
        >
          {overlayCount > 0 ? `Clear overlay (${overlayCount.toLocaleString()})` : "Clear overlay"}
        </Button>
      </Group>
    </Stack>
  );
}
