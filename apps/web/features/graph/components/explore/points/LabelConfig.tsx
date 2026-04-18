"use client";

import { useMemo } from "react";
import { Select, Switch, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getRenderableColumnsForLayer } from "@/features/graph/lib/columns";
import type { DataColumnKey, MapLayer } from "@/features/graph/types";
import { sectionLabelStyle, panelSelectStyles, panelSwitchStyles, PANEL_ACCENT, GatedSwitch } from "../../panels/PanelShell";

export function LabelConfig({ activeLayer }: { activeLayer: MapLayer }) {
  const layerColumns = useMemo(
    () => getRenderableColumnsForLayer(activeLayer),
    [activeLayer],
  );

  // Only show columns that make sense as point labels — short text or
  // categorical identifiers, not numeric measures or long-form content.
  const LABEL_COLUMN_KEYS = new Set([
    'displayLabel', 'clusterLabel', 'paperTitle', 'citekey', 'journal',
    'category', 'canonicalName', 'id',
    // Harmless legacy extras if future modular layers add label-safe columns.
    'institution', 'country', 'city',
  ]);
  const labelColumnOptions = useMemo(
    () => layerColumns
      .filter((c) => LABEL_COLUMN_KEYS.has(c.key))
      .map((c) => ({ value: c.key, label: c.label })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layerColumns]
  );

  const zoomedIn = useGraphStore((s) => s.zoomedIn);

  const {
    pointLabelColumn, showPointLabels, showDynamicLabels,
    showHoveredPointLabel, hoverLabelAlwaysOn, renderHoveredPointRing,
    setPointLabelColumn, setShowPointLabels, setShowDynamicLabels,
    setShowHoveredPointLabel, setHoverLabelAlwaysOn, setRenderHoveredPointRing,
  } = useDashboardStore(useShallow((s) => ({
    pointLabelColumn: s.pointLabelColumn,
    showPointLabels: s.showPointLabels,
    showDynamicLabels: s.showDynamicLabels,
    showHoveredPointLabel: s.showHoveredPointLabel,
    hoverLabelAlwaysOn: s.hoverLabelAlwaysOn,
    renderHoveredPointRing: s.renderHoveredPointRing,
    setPointLabelColumn: s.setPointLabelColumn,
    setShowPointLabels: s.setShowPointLabels,
    setShowDynamicLabels: s.setShowDynamicLabels,
    setShowHoveredPointLabel: s.setShowHoveredPointLabel,
    setHoverLabelAlwaysOn: s.setHoverLabelAlwaysOn,
    setRenderHoveredPointRing: s.setRenderHoveredPointRing,
  })));

  return (
    <div>
      <Text size="xs" fw={600} mb={4} style={sectionLabelStyle}>
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
          styles={panelSwitchStyles}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Dynamic labels"
          checked={showDynamicLabels}
          onChange={(e) => setShowDynamicLabels(e.currentTarget.checked)}
          styles={panelSwitchStyles}
        />
        <GatedSwitch
          gateActive={zoomedIn}
          checked={showHoveredPointLabel}
          onChange={(e) => setShowHoveredPointLabel(e.currentTarget.checked)}
          label="Hover label"
          override={hoverLabelAlwaysOn}
          onOverrideChange={setHoverLabelAlwaysOn}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Hovered point ring"
          checked={renderHoveredPointRing}
          onChange={(e) => setRenderHoveredPointRing(e.currentTarget.checked)}
          styles={panelSwitchStyles}
        />
      </Stack>
    </div>
  );
}
