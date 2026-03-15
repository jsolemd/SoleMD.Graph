"use client";

import { useMemo } from "react";
import { Select, Switch, Slider, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/lib/graph/stores";
import { getColumnsForLayer } from "@/lib/graph/columns";
import { getLayerConfig } from "@/lib/graph/layers";
import { getPaletteColors } from "@/lib/graph/colors";
import { useGraphColorTheme } from "@/lib/graph/hooks/use-graph-color-theme";
import type {
  ColorSchemeName,
  DataColumnKey,
  NumericColumnKey,
  PointColorStrategy,
  PointSizeStrategy,
  SizeColumnKey,
} from "@/lib/graph/types";
import { sectionLabelStyle, panelSelectStyles, panelTextMutedStyle, switchLabelStyle, PANEL_ACCENT } from "../PanelShell";

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

function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <Text size="xs" mb={4} style={panelTextMutedStyle}>
        {label}
      </Text>
      <Slider
        size="xs"
        color={PANEL_ACCENT}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function PalettePreview({ schemeName }: { schemeName: ColorSchemeName }) {
  const theme = useGraphColorTheme();
  const colors = getPaletteColors(schemeName, theme);
  return (
    <div className="mt-1 flex h-2 overflow-hidden rounded">
      {colors.slice(0, 10).map((color, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export function PointsConfig() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);
  const hasLinks = layerConfig.hasLinks;
  const isMapLayer = layerConfig.rendererType === "maplibre";
  const layerColumns = useMemo(() => getColumnsForLayer(activeLayer), [activeLayer]);
  const numericCols = useMemo(() => layerColumns.filter((c) => c.type === 'numeric'), [layerColumns]);

  const colorColumnOptions = useMemo(() => [
    { value: "hexColor", label: "Hex color (pre-computed)" },
    ...layerColumns.map((c) => ({ value: c.key, label: c.label })),
  ], [layerColumns]);

  const sizeColumnOptions = useMemo(() => [
    { value: "none", label: "None (uniform)" },
    ...numericCols.map((c) => ({ value: c.key, label: c.label })),
  ], [numericCols]);

  const labelColumnOptions = useMemo(
    () => layerColumns.map((c) => ({ value: c.key, label: c.label })),
    [layerColumns]
  );

  const positionOptions = useMemo(
    () => numericCols.map((c) => ({ value: c.key, label: c.label })),
    [numericCols]
  );

  const timeColumnOptions = useMemo(() => [
    { value: "year", label: "Publication Year" },
    ...numericCols
      .filter((c) => c.key !== "year" && c.key !== "x" && c.key !== "y")
      .map((c) => ({ value: c.key, label: c.label })),
  ], [numericCols]);

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

  const {
    positionXColumn, positionYColumn, timelineColumn, showTimeline,
    setPositionXColumn, setPositionYColumn, setTimelineColumn, setShowTimeline,
  } = useDashboardStore(useShallow((s) => ({
    positionXColumn: s.positionXColumn,
    positionYColumn: s.positionYColumn,
    timelineColumn: s.timelineColumn,
    showTimeline: s.showTimeline,
    setPositionXColumn: s.setPositionXColumn,
    setPositionYColumn: s.setPositionYColumn,
    setTimelineColumn: s.setTimelineColumn,
    setShowTimeline: s.setShowTimeline,
  })));

  const {
    renderLinks, linkOpacity, linkGreyoutOpacity,
    linkVisibilityDistanceRange, linkVisibilityMinTransparency,
    linkDefaultWidth, curvedLinks, linkDefaultArrows, scaleLinksOnZoom,
    setRenderLinks, setLinkOpacity, setLinkGreyoutOpacity,
    setLinkVisibilityDistanceRange, setLinkVisibilityMinTransparency,
    setLinkDefaultWidth, setCurvedLinks, setLinkDefaultArrows, setScaleLinksOnZoom,
  } = useDashboardStore(useShallow((s) => ({
    renderLinks: s.renderLinks,
    linkOpacity: s.linkOpacity,
    linkGreyoutOpacity: s.linkGreyoutOpacity,
    linkVisibilityDistanceRange: s.linkVisibilityDistanceRange,
    linkVisibilityMinTransparency: s.linkVisibilityMinTransparency,
    linkDefaultWidth: s.linkDefaultWidth,
    curvedLinks: s.curvedLinks,
    linkDefaultArrows: s.linkDefaultArrows,
    scaleLinksOnZoom: s.scaleLinksOnZoom,
    setRenderLinks: s.setRenderLinks,
    setLinkOpacity: s.setLinkOpacity,
    setLinkGreyoutOpacity: s.setLinkGreyoutOpacity,
    setLinkVisibilityDistanceRange: s.setLinkVisibilityDistanceRange,
    setLinkVisibilityMinTransparency: s.setLinkVisibilityMinTransparency,
    setLinkDefaultWidth: s.setLinkDefaultWidth,
    setCurvedLinks: s.setCurvedLinks,
    setLinkDefaultArrows: s.setLinkDefaultArrows,
    setScaleLinksOnZoom: s.setScaleLinksOnZoom,
  })));

  const linkControlsDisabled = !renderLinks;

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
            onChange={(v) => v && setPointColorColumn(v as DataColumnKey | 'hexColor')}
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
            color={PANEL_ACCENT}
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
            onChange={(v) => v && setPointSizeColumn(v as SizeColumnKey)}
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
          <LabeledSlider
            label={`Size range: ${pointSizeRange[0]} \u2013 ${pointSizeRange[1]}`}
            value={pointSizeRange[1]}
            onChange={(v) => setPointSizeRange([pointSizeRange[0], v])}
            min={1}
            max={30}
            step={1}
          />
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

      {/* Labels — MapLibre handles its own label rendering via symbol layers */}
      {!isMapLayer && (
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
              onChange={(e) =>
                setRenderHoveredPointRing(e.currentTarget.checked)
              }
              styles={switchLabelStyle}
            />
          </Stack>
        </div>
      )}

      {/* Positions — geo layer uses real-world lat/lng, not configurable axes */}
      {!isMapLayer && (
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
              onChange={(v) => v && setPositionXColumn(v as NumericColumnKey)}
              styles={panelSelectStyles}
            />
            <Select
              size="xs"
              label="Y column"
              data={positionOptions}
              value={positionYColumn}
              onChange={(v) => v && setPositionYColumn(v as NumericColumnKey)}
              styles={panelSelectStyles}
            />
          </Stack>
        </div>
      )}

      {/* Timeline */}
      <div>
        <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
          Timeline
        </Text>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Time data column"
            data={timeColumnOptions}
            value={timelineColumn}
            onChange={(v) => v && setTimelineColumn(v as NumericColumnKey)}
            styles={panelSelectStyles}
          />
          <Switch
            size="xs"
            color={PANEL_ACCENT}
            label="Show timeline"
            checked={showTimeline}
            onChange={(e) => setShowTimeline(e.currentTarget.checked)}
            styles={switchLabelStyle}
          />
        </Stack>
      </div>

      {/* Links */}
      {hasLinks && (
        <>
          <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
            Links
          </Text>
          <Stack gap="xs">
            <Switch
              size="xs"
              color={PANEL_ACCENT}
              label={isMapLayer ? "Show collaboration arcs" : "Show links"}
              checked={renderLinks}
              onChange={(e) => setRenderLinks(e.currentTarget.checked)}
              styles={switchLabelStyle}
            />
            {/* Full Cosmograph link controls — only for non-map layers */}
            {!isMapLayer && (
              <>
                <LabeledSlider
                  label={`Opacity: ${linkOpacity.toFixed(2)}`}
                  value={linkOpacity}
                  onChange={setLinkOpacity}
                  min={0} max={1} step={0.05}
                  disabled={linkControlsDisabled}
                />
                <LabeledSlider
                  label={`Greyout opacity: ${linkGreyoutOpacity.toFixed(2)}`}
                  value={linkGreyoutOpacity}
                  onChange={setLinkGreyoutOpacity}
                  min={0} max={1} step={0.05}
                  disabled={linkControlsDisabled}
                />
                <LabeledSlider
                  label={`Fade range: ${linkVisibilityDistanceRange[0]} \u2013 ${linkVisibilityDistanceRange[1]}px`}
                  value={linkVisibilityDistanceRange[1]}
                  onChange={(v) => setLinkVisibilityDistanceRange([linkVisibilityDistanceRange[0], v])}
                  min={0} max={500} step={10}
                  disabled={linkControlsDisabled}
                />
                <LabeledSlider
                  label={`Min transparency: ${linkVisibilityMinTransparency.toFixed(2)}`}
                  value={linkVisibilityMinTransparency}
                  onChange={setLinkVisibilityMinTransparency}
                  min={0} max={1} step={0.05}
                  disabled={linkControlsDisabled}
                />
                <LabeledSlider
                  label={`Width: ${linkDefaultWidth}`}
                  value={linkDefaultWidth}
                  onChange={setLinkDefaultWidth}
                  min={0.5} max={10} step={0.5}
                  disabled={linkControlsDisabled}
                />
                <Switch
                  size="xs"
                  color={PANEL_ACCENT}
                  label="Curved links"
                  checked={curvedLinks}
                  onChange={(e) => setCurvedLinks(e.currentTarget.checked)}
                  styles={switchLabelStyle}
                  disabled={linkControlsDisabled}
                />
                <Switch
                  size="xs"
                  color={PANEL_ACCENT}
                  label="Show arrows"
                  checked={linkDefaultArrows}
                  onChange={(e) => setLinkDefaultArrows(e.currentTarget.checked)}
                  styles={switchLabelStyle}
                  disabled={linkControlsDisabled}
                />
                <Switch
                  size="xs"
                  color={PANEL_ACCENT}
                  label="Scale on zoom"
                  checked={scaleLinksOnZoom}
                  onChange={(e) => setScaleLinksOnZoom(e.currentTarget.checked)}
                  styles={switchLabelStyle}
                  disabled={linkControlsDisabled}
                />
              </>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
