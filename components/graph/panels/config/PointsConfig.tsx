"use client";

import { Select, Switch, Slider, Stack, Text } from "@mantine/core";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { NUMERIC_COLUMNS, ALL_DATA_COLUMNS } from "@/lib/graph/columns";

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

const sectionLabel: React.CSSProperties = {
  color: "var(--graph-panel-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const selectStyles = {
  input: {
    backgroundColor: "var(--graph-panel-input-bg)",
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text)",
  },
  label: {
    color: "var(--graph-panel-text-muted)",
  },
};

export function PointsConfig() {
  const pointColorColumn = useDashboardStore((s) => s.pointColorColumn);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const pointSizeColumn = useDashboardStore((s) => s.pointSizeColumn);
  const pointSizeRange = useDashboardStore((s) => s.pointSizeRange);
  const pointLabelColumn = useDashboardStore((s) => s.pointLabelColumn);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const showDynamicLabels = useDashboardStore((s) => s.showDynamicLabels);
  const showClusterLabels = useDashboardStore((s) => s.showClusterLabels);
  const positionXColumn = useDashboardStore((s) => s.positionXColumn);
  const positionYColumn = useDashboardStore((s) => s.positionYColumn);

  const setPointColorColumn = useDashboardStore((s) => s.setPointColorColumn);
  const setPointColorStrategy = useDashboardStore((s) => s.setPointColorStrategy);
  const setPointSizeColumn = useDashboardStore((s) => s.setPointSizeColumn);
  const setPointSizeRange = useDashboardStore((s) => s.setPointSizeRange);
  const setPointLabelColumn = useDashboardStore((s) => s.setPointLabelColumn);
  const setShowPointLabels = useDashboardStore((s) => s.setShowPointLabels);
  const setShowDynamicLabels = useDashboardStore((s) => s.setShowDynamicLabels);
  const setShowClusterLabels = useDashboardStore((s) => s.setShowClusterLabels);
  const setPositionXColumn = useDashboardStore((s) => s.setPositionXColumn);
  const setPositionYColumn = useDashboardStore((s) => s.setPositionYColumn);

  return (
    <Stack gap="lg">
      {/* Coloring */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabel}>
          Coloring
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Column"
            data={colorColumnOptions}
            value={pointColorColumn}
            onChange={(v) => v && setPointColorColumn(v)}
            styles={selectStyles}
          />
          <Select
            size="xs"
            label="Strategy"
            data={COLOR_STRATEGY_OPTIONS}
            value={pointColorStrategy}
            onChange={(v) => v && setPointColorStrategy(v)}
            styles={selectStyles}
          />
          <Select
            size="xs"
            label="Color Scheme"
            data={COLOR_SCHEME_OPTIONS}
            value="default"
            styles={selectStyles}
          />
        </Stack>
      </div>

      {/* Sizing */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabel}>
          Sizing
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Column"
            data={sizeColumnOptions}
            value={pointSizeColumn}
            onChange={(v) => v && setPointSizeColumn(v)}
            styles={selectStyles}
          />
          <div>
            <Text
              size="xs"
              mb={4}
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              Size range: {pointSizeRange[0]} – {pointSizeRange[1]}
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
        </Stack>
      </div>

      {/* Labels */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabel}>
          Labels
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Column"
            data={labelColumnOptions}
            value={pointLabelColumn}
            onChange={(v) => v && setPointLabelColumn(v)}
            styles={selectStyles}
          />
          <Switch
            size="xs"
            label="Show labels"
            checked={showPointLabels}
            onChange={(e) => setShowPointLabels(e.currentTarget.checked)}
            styles={{ label: { color: "var(--graph-panel-text)" } }}
          />
          <Switch
            size="xs"
            label="Dynamic labels"
            checked={showDynamicLabels}
            onChange={(e) => setShowDynamicLabels(e.currentTarget.checked)}
            styles={{ label: { color: "var(--graph-panel-text)" } }}
          />
          <Switch
            size="xs"
            label="Cluster labels"
            checked={showClusterLabels}
            onChange={(e) => setShowClusterLabels(e.currentTarget.checked)}
            styles={{ label: { color: "var(--graph-panel-text)" } }}
          />
        </Stack>
      </div>

      {/* Positions */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabel}>
          Positions
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="X column"
            data={positionOptions}
            value={positionXColumn}
            onChange={(v) => v && setPositionXColumn(v)}
            styles={selectStyles}
          />
          <Select
            size="xs"
            label="Y column"
            data={positionOptions}
            value={positionYColumn}
            onChange={(v) => v && setPositionYColumn(v)}
            styles={selectStyles}
          />
        </Stack>
      </div>
    </Stack>
  );
}
