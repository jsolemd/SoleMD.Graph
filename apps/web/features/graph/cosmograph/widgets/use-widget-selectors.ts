"use client";

import { useDeferredValue, useMemo } from "react";
import { useCosmographInternal } from "@cosmograph/react";
import {
  buildVisibilityScopeSqlExcludingSource,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import { getLayerTableName } from "@/features/graph/duckdb/sql-helpers";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveWidgetBaselineScope } from "./widget-baseline";

/**
 * Shared store selectors + derived memos used by every crossfilter widget
 * (TimelineWidget, FilterHistogramWidget, FilterBarWidget).
 *
 * `currentScopeRevision` is deferred via `useDeferredValue` so that rapid
 * brush drags batch scoped highlight re-queries instead of firing per frame.
 * The canvas filtering via `pointsSelection.update()` still fires immediately.
 *
 * `cosmograph` is read via `useCosmographInternal()` (not the throwing
 * `useCosmograph()`) so the hook stays mountable from renderer-clean
 * surfaces — notably the 3D OrbSurface, which mounts FiltersPanel through
 * `GraphPanelsLayer` without a CosmographProvider in the tree. When
 * `cosmograph` is null, every widget consumer of this hook must early-
 * return; both `FilterBarWidget` and `FilterHistogramWidget` already do
 * (`if (!cosmograph) return;` in their layout effect).
 */
export function useWidgetSelectors(
  sourcePrefix: "timeline" | "filter",
  column: string,
) {
  const cosmograph = useCosmographInternal()?.cosmograph ?? null;
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const currentScopeRevision = useDashboardStore(
    (s) => s.currentScopeRevision,
  );
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore(
    (s) => s.selectedPointRevision,
  );

  // Defer scope revision so scoped highlight queries batch during rapid brush
  const deferredScopeRevision = useDeferredValue(currentScopeRevision);

  const sourceId = `${sourcePrefix}:${column}`;
  const source = useMemo(
    () => createSelectionSource(sourceId),
    [sourceId],
  );
  const tableName = useMemo(
    () => getLayerTableName(activeLayer),
    [activeLayer],
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
  const scopeSql = useMemo(
    () =>
      buildVisibilityScopeSqlExcludingSource(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deferredScopeRevision batches rapid revision bumps
    [cosmograph, deferredScopeRevision, sourceId],
  );
  const isSubset = hasCurrentPointScopeSql(scopeSql);

  return {
    cosmograph,
    activeLayer,
    currentScopeRevision,
    sourceId,
    source,
    tableName,
    baselineScope,
    baselineCacheKey,
    scopeSql,
    isSubset,
  };
}
