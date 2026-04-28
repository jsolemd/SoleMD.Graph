"use client";

import { useCallback } from "react";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";

import { useResolveAndSelectNode } from "@/features/graph/hooks/use-resolve-and-select-node";
import { buildSelectedViewPredicate } from "@/features/graph/duckdb/sql-helpers";
import {
  commitSelectionState,
  mergeSelectionPointIndices,
  readCommittedSelectedPointIndices,
} from "@/features/graph/lib/graph-selection-state";
import type { GraphSelectionChordState } from "@/features/graph/lib/graph-selection-chords";
import { ORB_MANUAL_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

const PAPER_SAMPLE_TABLE = "paper_sample";
const SELECTED_POINT_INDICES_SCOPE_SQL = buildSelectedViewPredicate();

function buildOrbParticleSelectionSql(particleIndex: number): string {
  return `
    SELECT id
    FROM ${PAPER_SAMPLE_TABLE}
    WHERE particleIdx = ${Math.trunc(particleIndex)}
    LIMIT 1
  `;
}

function readPointId(row: Record<string, unknown> | undefined): string | null {
  const id = row?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Orb paper-selection handler.
 *
 * Consumes `useResolveAndSelectNode` (the cross-renderer selection
 * funnel) and returns a `selectByIndex(index | null)` callback for the
 * orb picking path. When the field picker resolves a click to a
 * particle index, this hook dispatches `{ layer, id }` into the graph
 * store via the shared resolver — the same code path Cosmograph uses.
 * Shift-click is the explicit-selection lane: it resolves the same
 * paper id to the canonical graph point, appends it to
 * `selected_point_indices`, and leaves plain click inspection-only.
 *
 * When `queries` is null (bundle not yet warm) the hook always returns
 * a no-op — we can't resolve a click without DuckDB. `useResolveAndSelectNode`
 * is still wired so the callback dependency keys stay stable once
 * queries arrives.
 */
export function useOrbClick(
  queries: GraphBundleQueries | null,
  activeLayer: GraphLayer,
) {
  const selectNode = useGraphStore((s) => s.selectNode);
  const setFocusedPointIndex = useGraphStore((s) => s.setFocusedPointIndex);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const setCurrentPointScopeSql = useDashboardStore(
    (s) => s.setCurrentPointScopeSql,
  );
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId,
  );
  const setVisualSelectionIndices = useOrbFocusVisualStore(
    (s) => s.setSelectionIndices,
  );
  // Only invoke the real resolver when queries is present. Casting
  // is safe because the outer callback guards on `queries == null` and
  // the underlying hook returns a callback that closes over queries —
  // it doesn't dereference it at build time.
  const resolveAndSelect = useResolveAndSelectNode(
    (queries ?? null) as unknown as GraphBundleQueries,
    activeLayer,
  );

  return useCallback(
    (index: number | null, chords?: GraphSelectionChordState) => {
      if (queries == null) return;
      if (index == null || index < 0) return;
      void queries
        .runReadOnlyQuery(buildOrbParticleSelectionSql(index))
        .then(async (result) => {
          const id = readPointId(result.rows[0]);
          if (id == null) return;
          if (!chords?.addToSelection || selectionLocked) {
            return resolveAndSelect({ id });
          }

          const node = await queries.resolvePointSelection(activeLayer, { id });
          if (!node) return;

          selectNode(node);
          setFocusedPointIndex(node.index);

          const current = await readCommittedSelectedPointIndices(queries);
          const pointIndices = mergeSelectionPointIndices(current, [node.index]);
          const visualSelectionIndices = mergeSelectionPointIndices(
            useOrbFocusVisualStore.getState().selectionIndices,
            [index],
          );
          return commitSelectionState({
            sourceId: ORB_MANUAL_SELECTION_SOURCE_ID,
            queries,
            pointIndices,
            setSelectedPointCount,
            setActiveSelectionSourceId,
            scopeUpdate: {
              currentPointScopeSql: SELECTED_POINT_INDICES_SCOPE_SQL,
              setCurrentPointScopeSql,
              forceRevision: true,
            },
          }).then(() => {
            setVisualSelectionIndices(visualSelectionIndices);
          });
        })
        .catch(() => {});
    },
    [
      activeLayer,
      queries,
      resolveAndSelect,
      selectNode,
      selectionLocked,
      setActiveSelectionSourceId,
      setCurrentPointScopeSql,
      setFocusedPointIndex,
      setSelectedPointCount,
      setVisualSelectionIndices,
    ],
  );
}
