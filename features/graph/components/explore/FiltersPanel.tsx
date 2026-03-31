"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CosmographWidgetBoundary } from "../canvas/CosmographWidgetBoundary";
import { FilterBarWidget } from "@/features/graph/cosmograph/widgets/FilterBarWidget";
import { FilterHistogramWidget } from "@/features/graph/cosmograph/widgets/FilterHistogramWidget";
import { toFacetRowsFromBarCounts } from "@/features/graph/cosmograph/widgets/facet-rows";
import {
  getCachedCategoricalDataset,
  getWidgetDatasetCacheKeyWithRevision,
  setCachedCategoricalDataset,
} from "@/features/graph/cosmograph/widgets/dataset-cache";
import { NATIVE_BARS_DATA_LIMIT } from "@/features/graph/cosmograph/widgets/native-bars-adapter";
import { resolveWidgetBaselineScope } from "@/features/graph/cosmograph/widgets/widget-baseline";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoFacetRow } from "@/features/graph/types";
import { FilterPanelShell } from "./FilterPanelShell";
import { queryWidgetThemeVars } from "./widget-theme";

function AdapterFilterWidget({
  filter,
  queries,
  bundleChecksum,
  overlayRevision,
  initialDatasetRows,
  datasetLoading,
}: {
  filter: { column: string; type: string };
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
  initialDatasetRows?: GraphInfoFacetRow[];
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

export function FiltersPanel({
  queries,
  bundleChecksum,
  overlayRevision,
}: {
  queries: GraphBundleQueries;
  bundleChecksum: string;
  overlayRevision: number;
}) {
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const selectionLocked = useDashboardStore((state) => state.selectionLocked);
  const selectedPointCount = useDashboardStore((state) => state.selectedPointCount);
  const selectedPointRevision = useDashboardStore((state) => state.selectedPointRevision);
  const [visibleFilters, setVisibleFilters] = useState<
    Array<{ column: string; type: string }>
  >([]);
  const [primedDatasets, setPrimedDatasets] = useState<
    Record<string, GraphInfoFacetRow[]>
  >({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});
  const requestIdRef = useRef(0);

  const visibleCategoricalFilters = useMemo(
    () => visibleFilters.filter((filter) => filter.type !== "numeric"),
    [visibleFilters],
  );
  const { scope: baselineScope, cacheKey: baselineCacheKey } = useMemo(
    () =>
      resolveWidgetBaselineScope({
        selectionLocked,
        selectedPointCount,
        selectedPointRevision,
      }),
    [selectedPointCount, selectedPointRevision, selectionLocked],
  );

  useEffect(() => {
    setPrimedDatasets({});
    setLoadingColumns({});
  }, [activeLayer, baselineScope, bundleChecksum, overlayRevision]);

  useEffect(() => {
    if (visibleCategoricalFilters.length === 0) {
      setLoadingColumns({});
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

    const missingColumns = visibleCategoricalFilters
      .map((filter) => filter.column)
      .filter((column) => !cachedRowsByColumn[column]);

    if (missingColumns.length === 0) {
      setLoadingColumns({});
      return;
    }

    setLoadingColumns(
      Object.fromEntries(missingColumns.map((column) => [column, true])),
    );

    queries
      .getInfoBarsBatch({
        layer: activeLayer,
        scope: baselineScope,
        columns: missingColumns,
        maxItems: NATIVE_BARS_DATA_LIMIT,
        currentPointScopeSql: null,
      })
      .then((results) => {
        if (nextRequestId !== requestIdRef.current) {
          return;
        }

        for (const column of missingColumns) {
          const rows = toFacetRowsFromBarCounts(results[column] ?? []);
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

        setPrimedDatasets((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(results).map(([column, rows]) => [
              column,
              toFacetRowsFromBarCounts(rows),
            ]),
          ),
        }));
        setLoadingColumns({});
      })
      .catch(() => {
        if (nextRequestId !== requestIdRef.current) {
          return;
        }

        setLoadingColumns({});
      });
  }, [
    activeLayer,
    baselineCacheKey,
    baselineScope,
    bundleChecksum,
    overlayRevision,
    queries,
    visibleCategoricalFilters,
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
          datasetLoading={loadingColumns[filter.column] === true}
        />
      )}
    />
  );
}
