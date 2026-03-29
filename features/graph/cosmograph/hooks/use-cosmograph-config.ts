"use client";

import { useMemo, useState } from "react";
import { useComputedColorScheme } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getPaletteColors, resolvePaletteSelection } from "@/features/graph/lib/colors";
import { getPointIncludeColumns } from "@/features/graph/lib/cosmograph-columns";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import { BRAND } from "@/features/graph/lib/brand-colors";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

export function useCosmographConfig(canvas: GraphCanvasSource) {
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colors = isDark ? BRAND.dark : BRAND.light;

  // Active layer — determines which DuckDB table Cosmograph reads from
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);
  const activeCanvasTables = canvas.layerTables[activeLayer];
  const activePanel = useDashboardStore((s) => s.activePanel);
  const filterColumns = useDashboardStore((s) => s.filterColumns);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const tableOpen = useDashboardStore((s) => s.tableOpen);

  // Point config — grouped with useShallow to avoid unnecessary re-renders
  const {
    pointColorColumn, pointColorStrategy, colorScheme: colorSchemeName,
    pointSizeColumn, pointSizeRange, pointSizeStrategy, scalePointsOnZoom,
    pointLabelColumn, showPointLabels, showDynamicLabels,
    showHoveredPointLabel, renderHoveredPointRing,
    positionXColumn, positionYColumn,
  } = useDashboardStore(useShallow((s) => ({
    pointColorColumn: s.pointColorColumn,
    pointColorStrategy: s.pointColorStrategy,
    colorScheme: s.colorScheme,
    pointSizeColumn: s.pointSizeColumn,
    pointSizeRange: s.pointSizeRange,
    pointSizeStrategy: s.pointSizeStrategy,
    scalePointsOnZoom: s.scalePointsOnZoom,
    pointLabelColumn: s.pointLabelColumn,
    showPointLabels: s.showPointLabels,
    showDynamicLabels: s.showDynamicLabels,
    showHoveredPointLabel: s.showHoveredPointLabel,
    renderHoveredPointRing: s.renderHoveredPointRing,
    positionXColumn: s.positionXColumn,
    positionYColumn: s.positionYColumn,
  })));

  // Link config — only relevant for layers with meaningful link data
  const hasLinks = layerConfig.hasLinks;
  const {
    renderLinks, linkOpacity, linkGreyoutOpacity,
    linkVisibilityDistanceRange, linkVisibilityMinTransparency,
    linkDefaultWidth, curvedLinks, linkDefaultArrows, scaleLinksOnZoom,
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
  })));

  const colorTheme = useGraphColorTheme();

  const {
    colorColumn: effectiveColorColumn,
    colorStrategy: effectiveColorStrategy,
  } = useMemo(
    () =>
      resolvePaletteSelection(
        pointColorColumn,
        pointColorStrategy,
        colorSchemeName,
        colorTheme,
      ),
    [pointColorColumn, pointColorStrategy, colorSchemeName, colorTheme],
  );

  // Include activeLayer + pointColorColumn so Cosmograph receives a fresh array
  // reference on layer/column switches — without this, Cosmograph skips re-coloring
  // when the palette values haven't changed but the data table has.
  const palette = useMemo(
    () => getPaletteColors(colorSchemeName, colorTheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorSchemeName, colorTheme, activeLayer, pointColorColumn],
  );

  const [renderedPointCount, setRenderedPointCount] = useState<number | null>(null);
  const pointIncludeColumns = useMemo(
    () =>
      getPointIncludeColumns({
        layer: activeLayer,
        activePanel,
        showTimeline,
        filterColumns,
        timelineColumn,
      }),
    [activeLayer, activePanel, filterColumns, showTimeline, timelineColumn],
  );

  const totalPointCount = useMemo(() => {
    return renderedPointCount ?? canvas.pointCounts[activeLayer] ?? 0;
  }, [activeLayer, canvas.pointCounts, renderedPointCount]);

  // Auto-scale opacity: sparse graphs stay a touch more opaque so individual
  // points are visible; dense graphs soften further to avoid glare.
  const effectiveOpacity = useMemo(() => {
    const pointCount = totalPointCount;
    const density = Math.min(
      Math.log10(Math.max(pointCount, 1)) / Math.log10(2_500_000),
      1,
    );
    const minOpacity = isDark ? 0.42 : 0.28;
    const maxOpacity = isDark ? 0.72 : 0.56;
    return maxOpacity - density * (maxOpacity - minOpacity);
  }, [isDark, totalPointCount]);

  const fitViewPadding = useMemo(() => {
    const pointCount = totalPointCount;
    if (pointCount >= 2_000_000) return 0.18;
    if (pointCount >= 1_000_000) return 0.15;
    if (pointCount >= 250_000) return 0.12;
    return 0.1;
  }, [totalPointCount]);

  return {
    // Theme
    isDark,
    colors,
    // Layer
    activeLayer,
    layerConfig,
    activeCanvasTables,
    activePanel,
    tableOpen,
    // Point config
    pointColorColumn,
    effectiveColorColumn,
    effectiveColorStrategy,
    palette,
    pointSizeColumn,
    pointSizeRange,
    pointSizeStrategy,
    scalePointsOnZoom,
    pointLabelColumn,
    showPointLabels,
    showDynamicLabels,
    showHoveredPointLabel,
    renderHoveredPointRing,
    positionXColumn,
    positionYColumn,
    pointIncludeColumns,
    // Link config
    hasLinks,
    renderLinks,
    linkOpacity,
    linkGreyoutOpacity,
    linkVisibilityDistanceRange,
    linkVisibilityMinTransparency,
    linkDefaultWidth,
    curvedLinks,
    linkDefaultArrows,
    scaleLinksOnZoom,
    // Computed
    totalPointCount,
    effectiveOpacity,
    fitViewPadding,
    renderedPointCount,
    setRenderedPointCount,
  };
}
