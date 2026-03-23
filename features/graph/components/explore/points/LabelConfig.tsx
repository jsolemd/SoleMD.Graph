"use client";

import { useMemo } from "react";
import { Select, Switch, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getColumnsForLayer } from "@/features/graph/lib/columns";
import type { DataColumnKey, MapLayer } from "@/features/graph/types";
import { sectionLabelStyle, panelSelectStyles, switchLabelStyle, PANEL_ACCENT } from "../../panels/PanelShell";

export function LabelConfig({ activeLayer }: { activeLayer: MapLayer }) {
  const layerColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);

  const labelColumnOptions = useMemo(
    () => layerColumns.map((c) => ({ value: c.key, label: c.label })),
    [layerColumns]
  );

  const {
    pointLabelColumn, showPointLabels, showDynamicLabels,
    showHoveredPointLabel, renderHoveredPointRing,
    setPointLabelColumn, setShowPointLabels, setShowDynamicLabels,
    setShowHoveredPointLabel, setRenderHoveredPointRing,
  } = useDashboardStore(useShallow((s) => ({
    pointLabelColumn: s.pointLabelColumn,
    showPointLabels: s.showPointLabels,
    showDynamicLabels: s.showDynamicLabels,
    showHoveredPointLabel: s.showHoveredPointLabel,
    renderHoveredPointRing: s.renderHoveredPointRing,
    setPointLabelColumn: s.setPointLabelColumn,
    setShowPointLabels: s.setShowPointLabels,
    setShowDynamicLabels: s.setShowDynamicLabels,
    setShowHoveredPointLabel: s.setShowHoveredPointLabel,
    setRenderHoveredPointRing: s.setRenderHoveredPointRing,
  })));

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Labels
      </Text>
      <Stack gap="xs">
        <Select
          size="xs"
          label="Column"
          data={labelColumnOptions}
          value={pointLabelColumn}
          onChange={(v) => v && setPointLabelColumn(v as DataColumnKey)}
          styles={panelSelectStyles}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Show labels"
          checked={showPointLabels}
          onChange={(e) => setShowPointLabels(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Dynamic labels"
          checked={showDynamicLabels}
          onChange={(e) => setShowDynamicLabels(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Show hovered point label"
          checked={showHoveredPointLabel}
          onChange={(e) => setShowHoveredPointLabel(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Hovered point ring"
          checked={renderHoveredPointRing}
          onChange={(e) => setRenderHoveredPointRing(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
      </Stack>
    </div>
  );
}
