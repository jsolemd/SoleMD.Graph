"use client";

import { useMemo } from "react";
import { Select, Switch, Stack, Text } from "@mantine/core";
import type { ComboboxItem } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getRenderableColumnsForLayer } from "@/features/graph/lib/columns";
import { COLOR_SCHEME_OPTIONS, getPaletteColors } from "@/features/graph/lib/colors";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { ColorSchemeName, DataColumnKey, MapLayer, PointColorStrategy } from "@/features/graph/types";
import { sectionLabelStyle, panelSelectStyles, panelSwitchStyles, PANEL_ACCENT } from "../../panels/PanelShell";

const COLOR_STRATEGY_OPTIONS = [
  { value: "direct", label: "Direct (hex values)" },
  { value: "categorical", label: "Categorical" },
  { value: "continuous", label: "Continuous" },
  { value: "single", label: "Single color" },
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

function ColorSwatchBar({ colors }: { colors: readonly string[] }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-sm">
      {colors.slice(0, 10).map((color) => (
        <div key={color} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function SchemeOptionContent({ option }: { option: ComboboxItem }) {
  const theme = useGraphColorTheme();
  const colors = getPaletteColors(option.value as ColorSchemeName, theme);
  return (
    <div className="flex w-full flex-col gap-0.5 py-0.5">
      <span className="text-xs">{option.label}</span>
      <ColorSwatchBar colors={colors} />
    </div>
  );
}

function renderSchemeOption({ option }: { option: ComboboxItem; checked?: boolean }) {
  return <SchemeOptionContent option={option} />;
}

export function ColorConfig({ activeLayer }: { activeLayer: MapLayer }) {
  const layerColumns = useMemo(
    () => getRenderableColumnsForLayer(activeLayer),
    [activeLayer],
  );

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
      <Text size="xs" fw={600} mb={4} style={sectionLabelStyle}>
        Coloring
      </Text>
      <Stack gap="xs">
        <div className="grid grid-cols-2 gap-2">
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
        </div>
        <div>
          <Select
            size="xs"
            label="Color Scheme"
            data={COLOR_SCHEME_OPTIONS}
            value={colorScheme}
            onChange={(v) => v && setColorScheme(v as ColorSchemeName)}
            renderOption={renderSchemeOption}
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
          styles={panelSwitchStyles}
        />
      </Stack>
    </div>
  );
}
