"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Cosmograph,
  type CosmographData,
  type CosmographRef,
} from "@cosmograph/react";
import { useComputedColorScheme } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getPaletteColors, resolvePaletteSelection } from "@/features/graph/lib/colors";
import { getPointIncludeColumns } from "@/features/graph/lib/cosmograph-columns";
import {
  BUDGET_FOCUS_SOURCE_ID,
  buildBudgetScopeSql,
  buildVisibilityScopeSql,
  buildVisibilityFocusClause,
  clearSelectionClause,
  createSelectionSource,
  getSelectionSourceId,
  isBudgetScopeSelectionSourceId,
  isVisibilitySelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useGraphColorTheme } from "@/features/graph/hooks/use-graph-color-theme";
import type { GraphBundleQueries, GraphData, GraphNode } from "@/features/graph/types";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

import { BRAND } from "@/features/graph/lib/brand-colors";

function getFilteredPointIndices(filteredPoints: CosmographData): number[] {
  const indexColumn = filteredPoints.getChild("index");
  if (!indexColumn) {
    return [];
  }

  return Array.from(indexColumn.toArray()).filter(
    (index): index is number => typeof index === "number" && Number.isFinite(index),
  );
}

export default function CosmographRenderer({
  data,
  canvas,
  queries,
}: {
  data: GraphData | null;
  canvas: GraphCanvasSource;
  queries: GraphBundleQueries;
}) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const hasFittedView = useRef(false);
  const selectionRequestId = useRef(0);
  const visibilityBudgetRequestId = useRef(0);
  const budgetFocusSource = useMemo(
    () => createSelectionSource(BUDGET_FOCUS_SOURCE_ID),
    [],
  );
  const selectNode = useGraphStore((s) => s.selectNode);
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

  // Selection & interaction state
  const {
    setCurrentPointIndices, setCurrentPointScopeSql, selectedPointIndices,
    setSelectedPointIndices, setHighlightedPointIndices,
    setActiveSelectionSourceId, lockedSelection,
    visibilityFocus, clearVisibilityFocus, applyVisibilityBudget,
  } = useDashboardStore(useShallow((s) => ({
    setCurrentPointIndices: s.setCurrentPointIndices,
    setCurrentPointScopeSql: s.setCurrentPointScopeSql,
    selectedPointIndices: s.selectedPointIndices,
    setSelectedPointIndices: s.setSelectedPointIndices,
    setHighlightedPointIndices: s.setHighlightedPointIndices,
    setActiveSelectionSourceId: s.setActiveSelectionSourceId,
    lockedSelection: s.lockedSelection,
    visibilityFocus: s.visibilityFocus,
    clearVisibilityFocus: s.clearVisibilityFocus,
    applyVisibilityBudget: s.applyVisibilityBudget,
  })));
  const isLocked = lockedSelection !== null;

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

  // Label styling (Cosmograph applies these as inline CSS strings)
  const pointLabelStyle =
    "background: var(--graph-label-bg); border-radius: 4px; box-shadow: var(--graph-label-shadow);";
  const clusterLabelStyle =
    "background: var(--graph-cluster-label-bg); font-weight: 500; border-radius: 4px;";
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

  const activeNodes: GraphNode[] = useMemo(() => {
    if (!data) {
      return [];
    }
    return activeLayer === "paper" ? data.paperNodes : data.nodes;
  }, [activeLayer, data]);

  const totalPointCount = useMemo(() => {
    if (activeLayer === "geo") {
      return data?.geoNodes.length ?? canvas.pointCounts.geo ?? 0;
    }
    return canvas.pointCounts[activeLayer] ?? activeNodes.length;
  }, [activeLayer, activeNodes.length, canvas.pointCounts, data?.geoNodes.length]);

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

  // Build index->node map for O(1) lookup in callbacks
  const indexToNode = useMemo(() => {
    const map = new Map<number, GraphNode>();
    for (const node of activeNodes) {
      map.set(node.index, node);
    }
    return map;
  }, [activeNodes]);

  const resolveAndSelectNode = useCallback(
    async (selector: { id?: string; index?: number }) => {
      const requestId = ++selectionRequestId.current;
      const node =
        (selector.index != null ? indexToNode.get(selector.index) : null) ??
        (selector.id != null
          ? activeNodes.find((candidate) => candidate.id === selector.id) ?? null
          : null) ??
        (await queries.resolvePointSelection(activeLayer, selector));

      if (requestId !== selectionRequestId.current) {
        return;
      }

      selectNode(node);
    },
    [activeLayer, activeNodes, indexToNode, queries, selectNode]
  );

  const handleLabelClick = useCallback(
    (_index: number, id: string) => {
      void resolveAndSelectNode({ id });
    },
    [resolveAndSelectNode]
  );

  // Track the layer so we can re-fit view on layer changes
  const lastFittedLayer = useRef<string | null>(null);

  const handleGraphRebuilt = useCallback(() => {
    const isFirstFit = !hasFittedView.current;
    const isLayerChange = lastFittedLayer.current !== null && lastFittedLayer.current !== layerConfig.pointsTable;

    if (isFirstFit || isLayerChange) {
      hasFittedView.current = true;
      lastFittedLayer.current = layerConfig.pointsTable;
      cosmographRef.current?.fitView(0, fitViewPadding);
      clearVisibilityFocus();
      setCurrentPointIndices(null);
      setCurrentPointScopeSql(null);
      setSelectedPointIndices([]);
      setHighlightedPointIndices([]);
      setActiveSelectionSourceId(null);
    }

    if (lastFittedLayer.current === null) {
      lastFittedLayer.current = layerConfig.pointsTable;
    }
  }, [
    fitViewPadding,
    clearVisibilityFocus,
    layerConfig.pointsTable,
    setCurrentPointIndices,
    setActiveSelectionSourceId,
    setCurrentPointScopeSql,
    setHighlightedPointIndices,
    setSelectedPointIndices,
  ]);

  const handlePointClick = useCallback(
    (index: number) => {
      void resolveAndSelectNode({ index });
    },
    [resolveAndSelectNode]
  );

  const handleBackgroundClick = useCallback(() => {
    selectionRequestId.current += 1;
    clearVisibilityFocus();
    selectNode(null);
    // Explicitly clear programmatic selections (selectPoint calls)
    // that resetSelectionOnEmptyCanvasClick may not reach
    cosmographRef.current?.unselectAllPoints();
  }, [clearVisibilityFocus, selectNode]);

  const getIntentClauseIds = useCallback(() => {
    const clauses = cosmographRef.current?.pointsSelection?.clauses ?? [];
    return clauses
      .map((clause) =>
        typeof clause === "object" && clause !== null && "source" in clause
          ? getSelectionSourceId(clause.source)
          : null,
      )
      .filter(
        (sourceId): sourceId is string =>
          sourceId !== null &&
          !isVisibilitySelectionSourceId(sourceId)
      );
  }, []);

  useEffect(() => {
    const pointsSelection = cosmographRef.current?.pointsSelection;
    if (!pointsSelection) {
      return;
    }

    if (!visibilityFocus || visibilityFocus.layer !== activeLayer) {
      clearSelectionClause(pointsSelection, budgetFocusSource);
      return;
    }

    pointsSelection.update(
      buildVisibilityFocusClause(budgetFocusSource, visibilityFocus),
    );
  }, [activeLayer, budgetFocusSource, visibilityFocus]);

  const refreshVisibilityBudget = useCallback(async () => {
    if (activeLayer === "geo" || !visibilityFocus || visibilityFocus.layer !== activeLayer) {
      return;
    }

    const requestId = ++visibilityBudgetRequestId.current;
    const scopeSql = buildBudgetScopeSql(cosmographRef.current?.pointsSelection);
    const budget = await queries.getVisibilityBudget({
      layer: activeLayer,
      selector: { index: visibilityFocus.seedIndex },
      scopeSql,
    });

    if (requestId !== visibilityBudgetRequestId.current) {
      return;
    }

    if (!budget) {
      clearVisibilityFocus();
      return;
    }

    applyVisibilityBudget(activeLayer, budget);
  }, [
    activeLayer,
    applyVisibilityBudget,
    clearVisibilityFocus,
    queries,
    visibilityFocus,
  ]);

  const handlePointsFiltered = useCallback(
    (
      filteredPoints: CosmographData,
      callbackSelectedPointIndices: number[] | null | undefined
    ) => {
      let filteredIndicesCache: number[] | null = null;
      const getFilteredIndices = () => {
        if (filteredIndicesCache === null) {
          filteredIndicesCache = getFilteredPointIndices(filteredPoints);
        }
        return filteredIndicesCache;
      };
      const normalizedSelected =
        callbackSelectedPointIndices?.filter(
          (index): index is number => typeof index === "number"
        ) ?? [];
      const sourceId = cosmographRef.current?.getActiveSelectionSourceId() ?? null;
      const isVisibilitySource = isVisibilitySelectionSourceId(sourceId);
      const hasIntentClauses = getIntentClauseIds().length > 0;
      const pointClauseCount =
        cosmographRef.current?.pointsSelection?.clauses?.length ?? 0;
      const linkClauseCount =
        cosmographRef.current?.linksSelection?.clauses?.length ?? 0;
      const currentPointScopeSql =
        pointClauseCount > 0
          ? buildVisibilityScopeSql(cosmographRef.current?.pointsSelection)
          : null;
      const hasCurrentScope =
        (currentPointScopeSql != null &&
          currentPointScopeSql.trim().length > 0) ||
        linkClauseCount > 0;
      const shouldRefreshVisibilityBudget =
        isBudgetScopeSelectionSourceId(sourceId) &&
        visibilityFocus != null &&
        visibilityFocus.layer === activeLayer;
      const shouldKeepCurrentIndices =
        hasCurrentScope &&
        (activeLayer === "geo" || currentPointScopeSql == null);
      const shouldTrackHighlights =
        activeLayer === "geo" || tableOpen;

      const filteredIndices =
        shouldKeepCurrentIndices || shouldTrackHighlights
          ? getFilteredIndices()
          : [];
      const hasPartialCurrent =
        filteredIndices.length > 0 && filteredIndices.length < totalPointCount;
      const nextHighlight =
        normalizedSelected.length > 0
          ? normalizedSelected
          : hasPartialCurrent
            ? filteredIndices
            : [];

      setCurrentPointScopeSql(currentPointScopeSql);
      setCurrentPointIndices(shouldKeepCurrentIndices ? filteredIndices : null);

      // Locked mode freezes persistent intent and lets filters only alter the
      // currently visible/highlighted subset. Intent-changing widgets should
      // be disabled natively while locked, but this keeps the store resilient.
      if (lockedSelection && lockedSelection.size > 0) {
        if (isVisibilitySource) {
          if (shouldRefreshVisibilityBudget) {
            void refreshVisibilityBudget();
          }
          setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
          return;
        }

        setHighlightedPointIndices(
          shouldTrackHighlights ? selectedPointIndices : [],
        );
        return;
      }

      // Filters and timeline always define visibility/highlight only. They never
      // overwrite the user's persistent selection intent.
      if (isVisibilitySource) {
        if (shouldRefreshVisibilityBudget) {
          void refreshVisibilityBudget();
        }
        setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
        return;
      }

      // Non-filter sources update persistent intent only while they still own
      // a live selection clause. This is what prevents "clear selection under
      // active filters" from rehydrating intent from the current intersection.
      if (!hasIntentClauses) {
        setSelectedPointIndices([]);
        setHighlightedPointIndices(shouldTrackHighlights ? nextHighlight : []);
        setActiveSelectionSourceId(null);
        selectNode(null);
        return;
      }

      setSelectedPointIndices(normalizedSelected);
      setHighlightedPointIndices(normalizedSelected);
      setActiveSelectionSourceId(sourceId);
    },
    [
      activeLayer,
      getIntentClauseIds,
      lockedSelection,
      refreshVisibilityBudget,
      selectNode,
      selectedPointIndices,
      setActiveSelectionSourceId,
      setCurrentPointIndices,
      setCurrentPointScopeSql,
      setHighlightedPointIndices,
      setSelectedPointIndices,
      totalPointCount,
      tableOpen,
      visibilityFocus,
    ]
  );

  return (
    <Cosmograph
      ref={cosmographRef}
      duckDBConnection={canvas.duckDBConnection}
      points={layerConfig.pointsTable}
      links={layerConfig.linksTable}
      pointIdBy="id"
      pointIndexBy="index"
      pointXBy={positionXColumn}
      pointYBy={positionYColumn}
      pointColorBy={effectiveColorColumn}
      pointColorStrategy={effectiveColorStrategy}
      pointColorPalette={palette}
      pointSizeBy={pointSizeColumn === "none" ? undefined : pointSizeColumn}
      pointSizeStrategy={pointSizeStrategy}
      pointLabelBy={pointLabelColumn}
      pointLabelWeightBy="paperReferenceCount"
      pointIncludeColumns={
        pointIncludeColumns.length > 0 ? pointIncludeColumns : undefined
      }
      linkSourceBy={layerConfig.linkSourceBy}
      linkSourceIndexBy={layerConfig.linkSourceIndexBy}
      linkTargetBy={layerConfig.linkTargetBy}
      linkTargetIndexBy={layerConfig.linkTargetIndexBy}
      renderLinks={hasLinks && (renderLinks || selectedPointIndices.length > 0)}
      linkOpacity={hasLinks ? linkOpacity : undefined}
      linkGreyoutOpacity={hasLinks ? (renderLinks ? linkGreyoutOpacity : 0) : undefined}
      linkVisibilityDistanceRange={hasLinks ? linkVisibilityDistanceRange : undefined}
      linkVisibilityMinTransparency={hasLinks ? linkVisibilityMinTransparency : undefined}
      linkDefaultWidth={hasLinks ? linkDefaultWidth : undefined}
      curvedLinks={hasLinks ? curvedLinks : undefined}
      linkDefaultArrows={hasLinks ? linkDefaultArrows : undefined}
      scaleLinksOnZoom={hasLinks ? scaleLinksOnZoom : undefined}
      enableSimulation={false}
      backgroundColor={colors.bg}
      pointSizeRange={pointSizeRange}
      pointOpacity={effectiveOpacity}
      pointGreyoutOpacity={colors.greyout}
      scalePointsOnZoom={scalePointsOnZoom}
      pointClusterBy="clusterLabel"
      showClusterLabels
      showLabels={showPointLabels}
      showDynamicLabels={showDynamicLabels}
      showTopLabels={showPointLabels}
      showDynamicLabelsLimit={60}
      showTopLabelsLimit={40}
      showSelectedLabels
      showUnselectedPointLabels={false}
      selectedPointLabelsLimit={100}
      showHoveredPointLabel={showHoveredPointLabel}
      renderHoveredPointRing={renderHoveredPointRing}
      hoveredPointRingColor={colors.ring}
      pointLabelFontSize={11}
      pointLabelColor={colors.label}
      pointLabelClassName={pointLabelStyle}
      clusterLabelClassName={clusterLabelStyle}
      selectPointOnClick={isLocked ? false : hasLinks ? true : "single"}
      focusPointOnClick={!isLocked}
      resetSelectionOnEmptyCanvasClick={!isLocked}
      disableLogging
      onLabelClick={handleLabelClick}
      onGraphRebuilt={handleGraphRebuilt}
      onPointsFiltered={handlePointsFiltered}
      onPointClick={handlePointClick}
      onBackgroundClick={handleBackgroundClick}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
