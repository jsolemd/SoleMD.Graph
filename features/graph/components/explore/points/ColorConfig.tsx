"use client";

import { useMemo } from "react";
import { Select, Switch, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getColumnsForLayer } from "@/features/graph/lib/columns";
import { getPaletteColors } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { ColorSchemeName, DataColumnKey, MapLayer, PointColorStrategy } from "@/features/graph/types";
import { sectionLabelStyle, panelSelectStyles, switchLabelStyle, PANEL_ACCENT } from "../../panels/PanelShell";

const COLOR_STRATEGY_OPTIONS = [
  { value: "direct", label: "Direct (hex values)" },
  { value: "categorical", label: "Categorical" },
  { value: "continuous", label: "Continuous" },
  { value: "single", label: "Single color" },
];

const COLOR_SCHEME_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "spectral", label: "Spectral" },
  { value: "viridis", label: "Viridis" },
  { value: "plasma", label: "Plasma" },
  { value: "turbo", label: "Turbo" },
];

function PalettePreview({ schemeName }: { schemeName: ColorSchemeName }) {
  const theme = useGraphColorTheme();
  const colors = getPaletteColors(schemeName, theme);
  return (
    <div role="img" aria-label={`${schemeName} color palette`} className="mt-1 flex h-2 overflow-hidden rounded">
      {colors.slice(0, 10).map((color) => (
        <div key={color} aria-hidden="true" className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export function ColorConfig({ activeLayer }: { activeLayer: MapLayer }) {
  const layerColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);

  const colorColumnOptions = useMemo(() => [
    { value: "hexColor", label: "Hex color (pre-computed)" },
    ...layerColumns.map((c) => ({ value: c.key, label: c.label })),
  ], [layerColumns]);

  const {
    pointColorColumn, pointColorStrategy, colorScheme, showColorLegend,
    setPointColorColumn, setPointColorStrategy, setColorScheme, setShowColorLegend,
  } = useDashboardStore(useShallow((s) => ({
    pointColorColumn: s.pointColorColumn,
    pointColorStrategy: s.pointColorStrategy,
    colorScheme: s.colorScheme,
    showColorLegend: s.showColorLegend,
    setPointColorColumn: s.setPointColorColumn,
    setPointColorStrategy: s.setPointColorStrategy,
    setColorScheme: s.setColorScheme,
    setShowColorLegend: s.setShowColorLegend,
  })));

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Coloring
      </Text>
      <Stack gap="xs">
        <Select
          size="xs"
          label="Column"
          data={colorColumnOptions}
          value={pointColorColumn}
          onChange={(v) => v && setPointColorColumn(v as DataColumnKey | 'hexColor')}
          styles={panelSelectStyles}
        />
        <Select
          size="xs"
          label="Strategy"
          data={COLOR_STRATEGY_OPTIONS}
          value={pointColorStrategy}
          onChange={(v) => v && setPointColorStrategy(v as PointColorStrategy)}
          styles={panelSelectStyles}
        />
        <div>
          <Select
            size="xs"
            label="Color Scheme"
            data={COLOR_SCHEME_OPTIONS}
            value={colorScheme}
            onChange={(v) => v && setColorScheme(v as ColorSchemeName)}
            styles={panelSelectStyles}
          />
          <PalettePreview schemeName={colorScheme} />
        </div>
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Show color legend"
          checked={showColorLegend}
          onChange={(e) => setShowColorLegend(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
      </Stack>
    </div>
  );
}
