"use client";

import { useMemo } from "react";
import type { GraphInfoScope } from "@solemd/graph";
import { useDashboardStore } from "@/features/graph/stores";

export const ORB_RESIDENT_POINT_SCOPE_SQL =
  "index IN (SELECT pointIndex FROM paper_sample)";

export interface WidgetBaselineScope {
  scope: Extract<GraphInfoScope, "dataset" | "current" | "selected">;
  cacheKey: string;
  currentPointScopeSql: string | null;
  ready: boolean;
}

export function resolveWidgetBaselineScope(args: {
  selectionLocked: boolean;
  selectedPointCount: number;
  selectedPointRevision: number;
  rendererMode?: "2d" | "3d";
  orbResidentPointCount?: number | null;
  orbResidentRevision?: number;
}): WidgetBaselineScope {
  // Native widgets should reflect the canonical explicit selection
  // whenever one exists. `selectionLocked` is a persistence affordance,
  // not the gate for whether selected points are the widget baseline.
  const useSelectedBaseline = args.selectedPointCount > 0;
  if (useSelectedBaseline) {
    return {
      scope: "selected",
      cacheKey: `selected:${args.selectedPointRevision}`,
      currentPointScopeSql: null,
      ready: true,
    };
  }

  if (args.rendererMode === "3d") {
    const residentCount = args.orbResidentPointCount;
    return {
      scope: "current",
      cacheKey:
        residentCount == null
          ? "resident:pending"
          : `resident:${residentCount}:${args.orbResidentRevision ?? 0}`,
      currentPointScopeSql: ORB_RESIDENT_POINT_SCOPE_SQL,
      ready: residentCount != null,
    };
  }

  return {
    scope: "dataset",
    cacheKey: "dataset",
    currentPointScopeSql: null,
    ready: true,
  };
}

export function useWidgetBaselineScope(): WidgetBaselineScope {
  const rendererMode = useDashboardStore((s) => s.rendererMode);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore(
    (s) => s.selectedPointRevision,
  );
  const orbResidentPointCount = useDashboardStore(
    (s) => s.orbResidentPointCount,
  );
  const orbResidentRevision = useDashboardStore((s) => s.orbResidentRevision);

  return useMemo(
    () =>
      resolveWidgetBaselineScope({
        rendererMode,
        selectionLocked,
        selectedPointCount,
        selectedPointRevision,
        orbResidentPointCount,
        orbResidentRevision,
      }),
    [
      rendererMode,
      selectionLocked,
      selectedPointCount,
      selectedPointRevision,
      orbResidentPointCount,
      orbResidentRevision,
    ],
  );
}
