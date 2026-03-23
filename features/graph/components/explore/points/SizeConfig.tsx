"use client";

import { useMemo } from "react";
import { Select, Switch, Slider, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getColumnsForLayer } from "@/features/graph/lib/columns";
import type { MapLayer, PointSizeStrategy, SizeColumnKey } from "@/features/graph/types";
import { sectionLabelStyle, panelSelectStyles, panelTextMutedStyle, switchLabelStyle, PANEL_ACCENT } from "../../panels/PanelShell";

const SIZE_STRATEGY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "direct", label: "Direct" },
  { value: "single", label: "Single (uniform)" },
];

export function SizeConfig({ activeLayer, isMapLayer }: { activeLayer: MapLayer; isMapLayer: boolean }) {
  const layerColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);
  const numericCols = useMemo(() => layerColumns.filter((c) => c.type === 'numeric'), [layerColumns]);

  const sizeColumnOptions = useMemo(() => [
    { value: "none", label: "None (uniform)" },
    ...numericCols.map((c) => ({ value: c.key, label: c.label })),
  ], [numericCols]);

  const {
    pointSizeColumn, pointSizeRange, pointSizeStrategy, scalePointsOnZoom, showSizeLegend,
    setPointSizeColumn, setPointSizeRange, setPointSizeStrategy, setScalePointsOnZoom, setShowSizeLegend,
  } = useDashboardStore(useShallow((s) => ({
    pointSizeColumn: s.pointSizeColumn,
    pointSizeRange: s.pointSizeRange,
    pointSizeStrategy: s.pointSizeStrategy,
    scalePointsOnZoom: s.scalePointsOnZoom,
    showSizeLegend: s.showSizeLegend,
    setPointSizeColumn: s.setPointSizeColumn,
    setPointSizeRange: s.setPointSizeRange,
    setPointSizeStrategy: s.setPointSizeStrategy,
    setScalePointsOnZoom: s.setScalePointsOnZoom,
    setShowSizeLegend: s.setShowSizeLegend,
  })));

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Sizing
      </Text>
      <Stack gap="xs">
        <Select
          size="xs"
          label="Column"
          data={sizeColumnOptions}
          value={pointSizeColumn}
          onChange={(v) => v && setPointSizeColumn(v as SizeColumnKey)}
          styles={panelSelectStyles}
        />
        <Select
          size="xs"
          label="Strategy"
          data={SIZE_STRATEGY_OPTIONS}
          value={pointSizeStrategy}
          onChange={(v) => v && setPointSizeStrategy(v as PointSizeStrategy)}
          styles={panelSelectStyles}
        />
        <div>
          <Text size="xs" mb={4} style={panelTextMutedStyle}>
            {`Size range: ${pointSizeRange[0]} \u2013 ${pointSizeRange[1]}`}
          </Text>
          <Slider
            aria-label="Size range"
            size="xs"
            color={PANEL_ACCENT}
            min={1}
            max={30}
            step={1}
            value={pointSizeRange[1]}
            onChange={(v) => setPointSizeRange([pointSizeRange[0], v])}
          />
        </div>
        {!isMapLayer && (
          <Switch
            size="xs"
            color={PANEL_ACCENT}
            label="Scale points on zoom"
            checked={scalePointsOnZoom}
            onChange={(e) => setScalePointsOnZoom(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        )}
        {!isMapLayer && (
          <Switch
            size="xs"
            color={PANEL_ACCENT}
            label="Show size legend"
            checked={showSizeLegend}
            onChange={(e) => setShowSizeLegend(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        )}
      </Stack>
    </div>
  );
}
