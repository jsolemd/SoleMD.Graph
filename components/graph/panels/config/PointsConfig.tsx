"use client";

import { Select, Switch, Slider, Stack, Text } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { NUMERIC_COLUMNS, ALL_DATA_COLUMNS } from "@/lib/graph/columns";
import { getPaletteColors } from "@/lib/graph/colors";
import type {
  ColorSchemeName,
  PointColorStrategy,
  PointSizeStrategy,
} from "@/lib/graph/types";
import { sectionLabelStyle, panelSelectStyles } from "../PanelShell";

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

const SIZE_STRATEGY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "direct", label: "Direct" },
  { value: "single", label: "Single (uniform)" },
];

const colorColumnOptions = [
  { value: "color", label: "color (pre-computed)" },
  ...ALL_DATA_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
];

const sizeColumnOptions = [
  { value: "none", label: "None (uniform)" },
  ...NUMERIC_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
];

const labelColumnOptions = ALL_DATA_COLUMNS.map((c) => ({
  value: c.key,
  label: c.label,
}));

const positionOptions = NUMERIC_COLUMNS.map((c) => ({
  value: c.key,
  label: c.label,
}));

const switchLabelStyle = { label: { color: "var(--graph-panel-text)" } };

function PalettePreview({ schemeName }: { schemeName: ColorSchemeName }) {
  const colors = getPaletteColors(schemeName);
  return (
    <div className="mt-1 flex h-2 overflow-hidden rounded">
      {colors.slice(0, 10).map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export function PointsConfig() {
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const colorScheme = useDashboardStore((s) => s.colorScheme);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const pointSizeColumn = useDashboardStore((s) => s.pointSizeColumn);
  const pointSizeRange = useDashboardStore((s) => s.pointSizeRange);
  const pointSizeStrategy = useDashboardStore((s) => s.pointSizeStrategy);
  const scalePointsOnZoom = useDashboardStore((s) => s.scalePointsOnZoom);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const pointLabelColumn = useDashboardStore((s) => s.pointLabelColumn);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const showDynamicLabels = useDashboardStore((s) => s.showDynamicLabels);
  const showClusterLabels = useDashboardStore((s) => s.showClusterLabels);
  const showHoveredPointLabel = useDashboardStore(
    (s) => s.showHoveredPointLabel
  );
  const positionXColumn = useDashboardStore((s) => s.positionXColumn);
  const positionYColumn = useDashboardStore((s) => s.positionYColumn);

  const setPointColorColumn = useDashboardStore((s) => s.setPointColorColumn);
  const setPointColorStrategy = useDashboardStore(
    (s) => s.setPointColorStrategy
  );
  const setColorScheme = useDashboardStore((s) => s.setColorScheme);
  const setShowColorLegend = useDashboardStore((s) => s.setShowColorLegend);
  const setPointSizeColumn = useDashboardStore((s) => s.setPointSizeColumn);
  const setPointSizeRange = useDashboardStore((s) => s.setPointSizeRange);
  const setPointSizeStrategy = useDashboardStore(
    (s) => s.setPointSizeStrategy
  );
  const setScalePointsOnZoom = useDashboardStore(
    (s) => s.setScalePointsOnZoom
  );
  const setShowSizeLegend = useDashboardStore((s) => s.setShowSizeLegend);
  const setPointLabelColumn = useDashboardStore((s) => s.setPointLabelColumn);
  const setShowPointLabels = useDashboardStore((s) => s.setShowPointLabels);
  const setShowDynamicLabels = useDashboardStore(
    (s) => s.setShowDynamicLabels
  );
  const setShowClusterLabels = useDashboardStore(
    (s) => s.setShowClusterLabels
  );
  const setShowHoveredPointLabel = useDashboardStore(
    (s) => s.setShowHoveredPointLabel
  );
  const setPositionXColumn = useDashboardStore((s) => s.setPositionXColumn);
  const setPositionYColumn = useDashboardStore((s) => s.setPositionYColumn);

  return (
    <Stack gap="lg">
      {/* Coloring */}
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
            onChange={(v) => v && setPointColorColumn(v)}
            styles={panelSelectStyles}
          />
          <Select
            size="xs"
            label="Strategy"
            data={COLOR_STRATEGY_OPTIONS}
            value={pointColorStrategy}
            onChange={(v) =>
              v && setPointColorStrategy(v as PointColorStrategy)
            }
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
            label="Show color legend"
            checked={showColorLegend}
            onChange={(e) => setShowColorLegend(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        </Stack>
      </div>

      {/* Sizing */}
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
            onChange={(v) => v && setPointSizeColumn(v)}
            styles={panelSelectStyles}
          />
          <Select
            size="xs"
            label="Strategy"
            data={SIZE_STRATEGY_OPTIONS}
            value={pointSizeStrategy}
            onChange={(v) =>
              v && setPointSizeStrategy(v as PointSizeStrategy)
            }
            styles={panelSelectStyles}
          />
          <div>
            <Text
              size="xs"
              mb={4}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              Size range: {pointSizeRange[0]} &ndash; {pointSizeRange[1]}
            </Text>
            <Slider
              size="xs"
              min={1}
              max={30}
              step={1}
              value={pointSizeRange[1]}
              onChange={(v) => setPointSizeRange([pointSizeRange[0], v])}
            />
          </div>
          <Switch
            size="xs"
            label="Scale points on zoom"
            checked={scalePointsOnZoom}
            onChange={(e) => setScalePointsOnZoom(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
          <Switch
            size="xs"
            label="Show size legend"
            checked={showSizeLegend}
            onChange={(e) => setShowSizeLegend(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        </Stack>
      </div>

      {/* Labels */}
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
            onChange={(v) => v && setPointLabelColumn(v)}
            styles={panelSelectStyles}
          />
          <Switch
            size="xs"
            label="Show labels"
            checked={showPointLabels}
            onChange={(e) => setShowPointLabels(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
          <Switch
            size="xs"
            label="Dynamic labels"
            checked={showDynamicLabels}
            onChange={(e) => setShowDynamicLabels(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
          <Switch
            size="xs"
            label="Cluster labels"
            checked={showClusterLabels}
            onChange={(e) => setShowClusterLabels(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
          <Switch
            size="xs"
            label="Show hovered point label"
            checked={showHoveredPointLabel}
            onChange={(e) => setShowHoveredPointLabel(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        </Stack>
      </div>

      {/* Positions */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
          Positions
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="X column"
            data={positionOptions}
            value={positionXColumn}
            onChange={(v) => v && setPositionXColumn(v)}
            styles={panelSelectStyles}
          />
          <Select
            size="xs"
            label="Y column"
            data={positionOptions}
            value={positionYColumn}
            onChange={(v) => v && setPositionYColumn(v)}
            styles={panelSelectStyles}
          />
        </Stack>
      </div>
    </Stack>
  );
}
