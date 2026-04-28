"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";
import { FilterBarWidget } from "@/features/graph/cosmograph/widgets/FilterBarWidget";
import { FilterHistogramWidget } from "@/features/graph/cosmograph/widgets/FilterHistogramWidget";
import { toFacetRowsFromBarCounts } from "@/features/graph/cosmograph/widgets/facet-rows";
import {
  getCachedCategoricalDataset,
  getCachedHistogramDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
  setCachedHistogramDataset,
} from "@/features/graph/cosmograph/widgets/dataset-cache";
import { NATIVE_BARS_DATA_LIMIT } from "@/features/graph/cosmograph/widgets/native-bars-adapter";
import { useWidgetBaselineScope } from "@/features/graph/cosmograph/widgets/widget-baseline";
import { useDashboardStore } from "@/features/graph/stores";
import type {
  GraphBundleQueries,
  GraphInfoFacetRow,
  GraphInfoHistogramResult,
} from "@solemd/graph";
import { FilterPanelShell } from "./FilterPanelShell";
import { queryWidgetThemeVars } from "./widget-theme";

function AdapterFilterWidget({
  filter,
  queries,
  bundleChecksum,
  overlayRevision,
  initialDatasetRows,
  initialHistogram,
  datasetLoading,
}: {
  filter: { column: string; type: string };
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  initialDatasetRows?: GraphInfoFacetRow[];
  initialHistogram?: GraphInfoHistogramResult;
  datasetLoading?: boolean;
}) {
  return (
    <CosmographWidgetBoundary>
      {filter.type === "numeric" ? (
        <FilterHistogramWidget
          column={filter.column}
          queries={queries}
          bundleChecksum={bundleChecksum}
          overlayRevision={overlayRevision}
          initialHistogram={initialHistogram}
          datasetLoading={datasetLoading}
        />
      ) : (
        <FilterBarWidget
          column={filter.column}
          queries={queries}
          bundleChecksum={bundleChecksum}
          overlayRevision={overlayRevision}
          initialDatasetRows={initialDatasetRows}
          datasetLoading={datasetLoading}
        />
      )}
    </CosmographWidgetBoundary>
  );
}

function FiltersPanelComponent({
  queries,
  bundleChecksum,
  overlayRevision,
}: {
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
}) {
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const [visibleFilters, setVisibleFilters] = useState<
    Array<{ column: string; type: string }>
  >([]);
  const [primedDatasets, setPrimedDatasets] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [primedHistograms, setPrimedHistograms] = useState<
    Record<string, GraphInfoHistogramResult>
  >({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});
  const requestIdRef = useRef(0);

  const visibleCategoricalFilters = useMemo(
    () => visibleFilters.filter((filter) => filter.type !== "numeric"),
    [visibleFilters],
  );
  const visibleNumericFilters = useMemo(
    () => visibleFilters.filter((filter) => filter.type === "numeric"),
    [visibleFilters],
  );
  const {
    scope: baselineScope,
    cacheKey: baselineCacheKey,
    currentPointScopeSql: baselineCurrentPointScopeSql,
    ready: baselineReady,
  } = useWidgetBaselineScope();

  useEffect(() => {
    setPrimedDatasets({});
    setPrimedHistograms({});
    setLoadingColumns({});
  }, [
    activeLayer,
    baselineCacheKey,
    baselineScope,
    bundleChecksum,
    overlayRevision,
  ]);

  useEffect(() => {
    if (
      visibleCategoricalFilters.length === 0 &&
      visibleNumericFilters.length === 0
    ) {
      setLoadingColumns({});
      return;
    }

    if (!baselineReady) {
      setLoadingColumns(
        Object.fromEntries(
          [...visibleCategoricalFilters, ...visibleNumericFilters].map(
            (filter) => [filter.column, true],
          ),
        ),
      );
      return;
    }

    const nextRequestId = ++requestIdRef.current;
    const cachedRowsByColumn = Object.fromEntries(
      visibleCategoricalFilters.flatMap((filter) => {
        const cacheKey = getWidgetDatasetCacheKeyWithRevision(
          bundleChecksum,
          activeLayer,
          filter.column,
          overlayRevision,
          baselineCacheKey,
        );
        const cachedRows = getCachedCategoricalDataset(cacheKey);
        return cachedRows ? [[filter.column, cachedRows] as const] : [];
      }),
    );

    if (Object.keys(cachedRowsByColumn).length > 0) {
      setPrimedDatasets((current) => ({
        ...current,
        ...cachedRowsByColumn,
      }));
    }
    const cachedHistogramsByColumn = Object.fromEntries(
      visibleNumericFilters.flatMap((filter) => {
        const cacheKey = getWidgetDatasetCacheKeyWithRevision(
          bundleChecksum,
          activeLayer,
          filter.column,
          overlayRevision,
          baselineCacheKey,
        );
        const cachedHistogram = getCachedHistogramDataset(cacheKey);
        return cachedHistogram ? [[filter.column, cachedHistogram] as const] : [];
      }),
    );

    if (Object.keys(cachedHistogramsByColumn).length > 0) {
      setPrimedHistograms((current) => ({
        ...current,
        ...cachedHistogramsByColumn,
      }));
    }

    const missingColumns = visibleCategoricalFilters
      .map((filter) => filter.column)
      .filter((column) => !cachedRowsByColumn[column]);
    const missingHistogramColumns = visibleNumericFilters
      .map((filter) => filter.column)
      .filter((column) => !cachedHistogramsByColumn[column]);

    if (missingColumns.length === 0 && missingHistogramColumns.length === 0) {
      setLoadingColumns({});
      return;
    }

    setLoadingColumns(
      Object.fromEntries(
        [...missingColumns, ...missingHistogramColumns].map((column) => [column, true]),
      ),
    );

    Promise.all([
      missingColumns.length > 0
        ? queries.getInfoBarsBatch({
            layer: activeLayer,
            scope: baselineScope,
            columns: missingColumns,
            maxItems: NATIVE_BARS_DATA_LIMIT,
            currentPointScopeSql: baselineCurrentPointScopeSql,
          })
        : Promise.resolve<Record<string, Array<{ value: string; count: number }>>>({}),
      missingHistogramColumns.length > 0
        ? queries.getInfoHistogramsBatch({
            layer: activeLayer,
            scope: baselineScope,
            columns: missingHistogramColumns,
            bins: 20,
            currentPointScopeSql: baselineCurrentPointScopeSql,
          })
        : Promise.resolve<Record<string, GraphInfoHistogramResult>>({}),
    ])
      .then(([categoricalResults, histogramResults]) => {
        if (nextRequestId !== requestIdRef.current) {
          return;
        }

        for (const column of missingColumns) {
          const rows = toFacetRowsFromBarCounts(categoricalResults[column] ?? []);
          setCachedCategoricalDataset(
            getWidgetDatasetCacheKeyWithRevision(
              bundleChecksum,
              activeLayer,
              column,
              overlayRevision,
              baselineCacheKey,
            ),
            rows,
          );
        }
        for (const column of missingHistogramColumns) {
          const histogram = histogramResults[column] ?? { bins: [], totalCount: 0 };
          setCachedHistogramDataset(
            getWidgetDatasetCacheKeyWithRevision(
              bundleChecksum,
              activeLayer,
              column,
              overlayRevision,
              baselineCacheKey,
            ),
            histogram,
          );
        }

        setPrimedDatasets((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(categoricalResults).map(([column, rows]) => [
              column,
              toFacetRowsFromBarCounts(rows),
            ]),
          ),
        }));
        setPrimedHistograms((current) => ({
          ...current,
          ...Object.fromEntries(
            missingHistogramColumns.map((column) => [
              column,
              histogramResults[column] ?? { bins: [], totalCount: 0 },
            ]),
          ),
        }));
        setLoadingColumns({});
      })
      .catch((error: unknown) => {
        console.error("[FiltersPanel] column batch hydration failed", error);
        if (nextRequestId !== requestIdRef.current) {
          return;
        }

        setLoadingColumns({});
      });
  }, [
    activeLayer,
    baselineCacheKey,
    baselineCurrentPointScopeSql,
    baselineReady,
    baselineScope,
    bundleChecksum,
    overlayRevision,
    queries,
    visibleCategoricalFilters,
    visibleNumericFilters,
  ]);

  const handleVisibleFiltersChange = useCallback(
    (filters: Array<{ column: string; type: string }>) => {
      setVisibleFilters(filters);
    },
    [],
  );

  return (
    <FilterPanelShell
      filterItemStyle={queryWidgetThemeVars}
      onVisibleFiltersChange={handleVisibleFiltersChange}
      renderWidget={(filter) => (
        <AdapterFilterWidget
          filter={filter}
          queries={queries}
          bundleChecksum={bundleChecksum}
          overlayRevision={overlayRevision}
          initialDatasetRows={primedDatasets[filter.column]}
          initialHistogram={primedHistograms[filter.column]}
          datasetLoading={loadingColumns[filter.column] === true}
        />
      )}
    />
  );
}

export const FiltersPanel = memo(FiltersPanelComponent);
FiltersPanel.displayName = "FiltersPanel";
