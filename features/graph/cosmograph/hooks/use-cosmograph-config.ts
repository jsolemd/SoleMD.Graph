"use client";

import { useMemo } from "react";
import { useComputedColorScheme } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { getPaletteColors, resolvePaletteSelection } from "@/features/graph/lib/colors";
import { getPointIncludeColumns } from "@/features/graph/lib/cosmograph-columns";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { BRAND, CANVAS } from "@/features/graph/lib/brand-colors";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

export function useCosmographConfig(canvas: GraphCanvasSource) {
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const colors = isDark ? BRAND.dark : BRAND.light;

  // Active layer — determines which DuckDB table Cosmograph reads from
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const layerConfig = getLayerConfig(activeLayer);
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
    showHoveredPointLabel, hoverLabelAlwaysOn, renderHoveredPointRing,
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
    hoverLabelAlwaysOn: s.hoverLabelAlwaysOn,
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

  // Always resolve palette/column as 'dark' — the CSS saturate() filter on the
  // canvas element handles light-mode boosting.  This keeps pointColorBy and
  // pointColorPalette stable across theme toggles so Cosmograph never re-reads
  // millions of points from DuckDB just because the user flipped the theme.
  const {
    colorColumn: effectiveColorColumn,
    colorStrategy: effectiveColorStrategy,
  } = useMemo(
    () =>
      resolvePaletteSelection(
        pointColorColumn,
        pointColorStrategy,
        colorSchemeName,
        'dark',
      ),
    [pointColorColumn, pointColorStrategy, colorSchemeName],
  );

  // Include activeLayer + pointColorColumn so Cosmograph receives a fresh array
  // reference on layer/column switches — without this, Cosmograph skips re-coloring
  // when the palette values haven't changed but the data table has.
  const palette = useMemo(
    () => getPaletteColors(colorSchemeName, 'dark'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorSchemeName, activeLayer, pointColorColumn],
  );

  const pointIncludeColumns = useMemo(
    () =>
      getPointIncludeColumns({
        layer: activeLayer,
        activePanel,
        showTimeline,
        filterColumns,
        timelineColumn,
        pointColorColumn,
        pointSizeColumn,
        pointLabelColumn,
        positionXColumn,
        positionYColumn,
      }),
    [
      activeLayer,
      activePanel,
      filterColumns,
      pointColorColumn,
      pointLabelColumn,
      pointSizeColumn,
      positionXColumn,
      positionYColumn,
      showTimeline,
      timelineColumn,
    ],
  );

  // Keep the native cluster grouping key stable while selection/zoom toggles
  // cluster-label visibility on and off. Recomputing grouping on every click
  // would force extra Cosmograph work for no behavioral gain.
  const pointClusterColumn = useMemo(
    () => (pointLabelColumn === "clusterLabel" ? "clusterLabel" : undefined),
    [pointLabelColumn],
  );

  // Identity passthrough — theme-independent so toggling dark/light never
  // invalidates the function reference and forces Cosmograph to re-read
  // millions of points. Light-mode color boost is handled by a CSS filter
  // on the canvas element instead (GPU-composited, instant).
  const pointColorByFn = useMemo(
    () => (value: unknown) => value as string | [number, number, number, number],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLayer, pointColorColumn, canvas.overlayRevision],
  );

  const linkColorByFn = useMemo(
    () =>
      // Same reason as `pointColorByFn`: keep the renderer bound to the
      // canonical current links alias while still making link reloads explicit.
      ((value: unknown) => value as string | [number, number, number, number]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLayer, canvas.overlayRevision],
  );

  const totalPointCount = useMemo(() => {
    return canvas.pointCounts[activeLayer] ?? 0;
  }, [activeLayer, canvas.pointCounts]);

  // Auto-scale opacity: sparse graphs stay a touch more opaque so individual
  // points are visible; dense graphs soften further to avoid glare.
  // Theme-independent — the CSS filter handles light-mode contrast.
  const effectiveOpacity = useMemo(() => {
    const density = Math.min(
      Math.log10(Math.max(totalPointCount, 1)) / Math.log10(2_500_000),
      1,
    );
    return CANVAS.maxOpacity - density * (CANVAS.maxOpacity - CANVAS.minOpacity);
  }, [totalPointCount]);

  const fitViewPadding = useMemo(() => {
    const pointCount = totalPointCount;
    if (pointCount >= 2_000_000) return 0.18;
    if (pointCount >= 1_000_000) return 0.15;
    if (pointCount >= 250_000) return 0.12;
    return 0.1;
  }, [totalPointCount]);

  return useMemo(() => ({
    // Theme
    isDark,
    colors,
    // Layer
    activeLayer,
    layerConfig,
    activePanel,
    tableOpen,
    // Point config
    pointColorColumn,
    effectiveColorColumn,
    effectiveColorStrategy,
    pointColorByFn,
    palette,
    pointSizeColumn,
    pointSizeRange,
    pointSizeStrategy,
    scalePointsOnZoom,
    pointLabelColumn,
    pointClusterColumn,
    showPointLabels,
    showDynamicLabels,
    showHoveredPointLabel,
    hoverLabelAlwaysOn,
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
    linkColorByFn,
    // Computed
    totalPointCount,
    effectiveOpacity,
    fitViewPadding,
  }), [
    isDark,
    colors,
    activeLayer,
    layerConfig,
    activePanel,
    tableOpen,
    pointColorColumn,
    effectiveColorColumn,
    effectiveColorStrategy,
    pointColorByFn,
    palette,
    pointSizeColumn,
    pointSizeRange,
    pointSizeStrategy,
    scalePointsOnZoom,
    pointLabelColumn,
    pointClusterColumn,
    showPointLabels,
    showDynamicLabels,
    showHoveredPointLabel,
    hoverLabelAlwaysOn,
    renderHoveredPointRing,
    positionXColumn,
    positionYColumn,
    pointIncludeColumns,
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
    linkColorByFn,
    totalPointCount,
    effectiveOpacity,
    fitViewPadding,
  ]);
}
