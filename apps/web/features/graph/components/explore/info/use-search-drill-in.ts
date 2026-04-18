"use client";

import { useCallback } from "react";

import { useGraphFocus, useGraphSelection } from "@/features/graph/cosmograph";
import { buildBudgetScopeSql } from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import type {
  GraphBundleQueries,
  GraphSearchResult,
} from "@solemd/graph";

export function useSearchDrillIn({ queries }: { queries: GraphBundleQueries }) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const applyVisibilityBudget = useDashboardStore((s) => s.applyVisibilityBudget);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const visibilityFocus = useDashboardStore((s) => s.visibilityFocus);
  const { focusNode } = useGraphFocus();
  const { getPointsSelection } = useGraphSelection();

  return useCallback(
    async (result: GraphSearchResult) => {
      focusNode(result.point, {
        zoomDuration: 250,
        selectPoint: true,
        addToSelection: false,
        expandLinks: false,
      });

      const sameVisibilityFocus =
        visibilityFocus?.layer === activeLayer &&
        visibilityFocus.seedIndex === result.point.index;

      if (sameVisibilityFocus) {
        return;
      }

      const scopeSql = buildBudgetScopeSql(getPointsSelection());
      const budget = await queries.getVisibilityBudget({
        layer: activeLayer,
        selector: {
          id: result.id,
          index: result.index,
        },
        scopeSql,
      });

      if (budget) {
        applyVisibilityBudget(activeLayer, budget);
      } else {
        clearVisibilityFocus();
      }
    },
    [
      activeLayer,
      applyVisibilityBudget,
      clearVisibilityFocus,
      focusNode,
      getPointsSelection,
      queries,
      visibilityFocus,
    ],
  );
}
