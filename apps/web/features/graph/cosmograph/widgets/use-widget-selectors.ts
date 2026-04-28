"use client";

import { useDeferredValue, useMemo } from "react";
import { useCosmographInternal } from "@cosmograph/react";
import {
  createSelectionSource,
  matchesSelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";
import {
  SELECTED_POINT_INDICES_SCOPE_SQL,
  combineScopeSqlClauses,
  hasCurrentPointScopeSql,
} from "@/features/graph/lib/selection-query-state";
import { getLayerTableName } from "@/features/graph/duckdb/sql-helpers";
import { useDashboardStore } from "@/features/graph/stores";
import { useWidgetBaselineScope } from "./widget-baseline";

/**
 * Shared store selectors + derived memos used by every crossfilter widget
 * (TimelineWidget, FilterHistogramWidget, FilterBarWidget).
 *
 * `visibilityScopeClauses` is deferred via `useDeferredValue` so that rapid
 * brush drags batch scoped highlight re-queries instead of firing per frame.
 * The shared visibility scope state still updates immediately; Cosmograph's
 * private crossfilter is mirrored only when a native 2D renderer is mounted.
 *
 * `cosmograph` is read via `useCosmographInternal()` (not the throwing
 * `useCosmograph()`) so the hook stays mountable from renderer-clean
 * surfaces — notably the 3D OrbSurface, which mounts FiltersPanel through
 * `GraphPanelsLayer` without a CosmographProvider in the tree. The widgets
 * still mount native `@cosmograph/ui` controls in that mode; only the private
 * Cosmograph crossfilter client is optional.
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
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const visibilityScopeClauses = useDashboardStore(
    (s) => s.visibilityScopeClauses,
  );

  const deferredVisibilityScopeClauses = useDeferredValue(visibilityScopeClauses);

  const sourceId = `${sourcePrefix}:${column}`;
  const source = useMemo(
    () => createSelectionSource(sourceId),
    [sourceId],
  );
  const tableName = useMemo(
    () => getLayerTableName(activeLayer),
    [activeLayer],
  );
  const {
    scope: baselineScope,
    cacheKey: baselineCacheKey,
    currentPointScopeSql: baselineCurrentPointScopeSql,
    ready: baselineReady,
  } = useWidgetBaselineScope();
  const scopeSql = useMemo(
    () => {
      const visibilityScopeSql = combineScopeSqlClauses(
        ...Object.values(deferredVisibilityScopeClauses)
          .filter(
            (clause) => !matchesSelectionSourceId(clause.sourceId, sourceId),
          )
          .map((clause) => clause.sql),
      );

      return selectedPointCount > 0
        ? combineScopeSqlClauses(
            SELECTED_POINT_INDICES_SCOPE_SQL,
            visibilityScopeSql,
          )
        : visibilityScopeSql
          ? combineScopeSqlClauses(
              baselineCurrentPointScopeSql,
              visibilityScopeSql,
            )
          : null;
    },
    [
      baselineCurrentPointScopeSql,
      deferredVisibilityScopeClauses,
      selectedPointCount,
      sourceId,
    ],
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
    baselineCurrentPointScopeSql,
    baselineReady,
    scopeSql,
    isSubset,
  };
}
