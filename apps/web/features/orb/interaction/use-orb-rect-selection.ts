"use client";

import { useCallback, useRef } from "react";
import type { GraphBundleQueries, GraphLayer } from "@solemd/graph";

import {
  buildSelectedViewPredicate,
  getLayerTableName,
} from "@/features/graph/duckdb/sql-helpers";
import {
  commitSelectionState,
  mergeSelectionPointIndices,
  readCommittedSelectedPointIndices,
} from "@/features/graph/lib/graph-selection-state";
import type { GraphSelectionChordState } from "@/features/graph/lib/graph-selection-chords";
import { ORB_MANUAL_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import type { OrbSelectionRect } from "./OrbInteractionSurface";
import { useOrbPickerStore } from "./orb-picker-store";
import { useSelectionCommitGate } from "./use-selection-commit-gate";

const PAPER_SAMPLE_TABLE = "paper_sample";
const SELECTED_POINT_INDICES_SCOPE_SQL = buildSelectedViewPredicate();
export const ORB_RECT_SELECTION_MAX_POINTS = 5_000;

export interface UseOrbRectSelectionOptions {
  queries: GraphBundleQueries | null;
  activeLayer: GraphLayer;
  enabled?: boolean;
  maxPoints?: number;
  onSelectionTooLarge?: (count: number) => void;
  onSelectionCommitted?: (count: number) => void;
  onSelectionFailed?: () => void;
}

function normalizeParticleIndices(indices: readonly number[]): number[] {
  return Array.from(
    new Set(
      indices
        .map((index) => Math.trunc(index))
        .filter((index) => Number.isInteger(index) && index >= 0),
    ),
  ).sort((a, b) => a - b);
}

function readPointIndex(row: Record<string, unknown>): number | null {
  const value =
    typeof row.index === "number"
      ? row.index
      : typeof row.index === "string"
        ? Number(row.index)
        : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function buildParticlePointIndexSql(
  activeLayer: GraphLayer,
  particleIndices: readonly number[],
): string {
  const values = particleIndices.map((index) => `(${index})`).join(", ");
  const pointTable = getLayerTableName(activeLayer);
  return `
    WITH selected_particles(particleIdx) AS (VALUES ${values})
    SELECT DISTINCT points.index AS index
    FROM selected_particles
    JOIN ${PAPER_SAMPLE_TABLE} sample
      ON sample.particleIdx = selected_particles.particleIdx
    JOIN ${pointTable} points
      ON points.id = sample.id
    ORDER BY index
  `;
}

async function resolvePointIndices(args: {
  queries: GraphBundleQueries;
  activeLayer: GraphLayer;
  particleIndices: readonly number[];
}): Promise<number[]> {
  if (args.particleIndices.length === 0) return [];
  const result = await args.queries.runReadOnlyQuery(
    buildParticlePointIndexSql(args.activeLayer, args.particleIndices),
  );
  return result.rows
    .map(readPointIndex)
    .filter((index): index is number => index != null)
    .sort((a, b) => a - b);
}

export function useOrbRectSelection(options: UseOrbRectSelectionOptions) {
  const {
    queries,
    activeLayer,
    enabled = true,
    maxPoints = ORB_RECT_SELECTION_MAX_POINTS,
    onSelectionTooLarge,
    onSelectionCommitted,
    onSelectionFailed,
  } = options;

  const requestIdRef = useRef(0);
  // Per-hook generation token — the highest result.generation we've
  // accepted so far. Out-of-order resolves whose generation is lower
  // than this watermark are stale (a bumpPickGeneration() fired after
  // they dispatched) and must be dropped without committing.
  const latestGenerationRef = useRef<number>(-Infinity);
  const gate = useSelectionCommitGate();
  const setCurrentPointScopeSql = useDashboardStore(
    (s) => s.setCurrentPointScopeSql,
  );
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore(
    (s) => s.setActiveSelectionSourceId,
  );
  const selectNode = useGraphStore((s) => s.selectNode);
  const setFocusedPointIndex = useGraphStore((s) => s.setFocusedPointIndex);
  const setPendingParticleIndices = useOrbFocusVisualStore(
    (s) => s.setPendingParticleIndices,
  );

  return useCallback(
    (rect: OrbSelectionRect, chords: GraphSelectionChordState) => {
      const requestId = ++requestIdRef.current;
      if (!enabled || queries == null || !gate.canCommit) return;

      const handle = useOrbPickerStore.getState().handle;
      if (!handle) return;

      // Snapshot the dispatch revision once per gesture; the resolver
      // uses this barrier to decide when canonical state has caught up.
      const dispatchRevision =
        useDashboardStore.getState().selectedPointRevision;

      void handle
        .pickRectAsync(rect, {
          mode: chords.throughVolume ? "through-volume" : "front-slab",
        })
        .then(async ({ indices: particleIndices, generation }) => {
          if (requestId !== requestIdRef.current) return;
          // Stale-pick drop: a later pickRectAsync (or bump) raised
          // the watermark while this readback was in flight. Discard
          // silently — committing it would write the wrong set.
          if (generation < latestGenerationRef.current) return;
          latestGenerationRef.current = generation;

          const normalizedParticles = normalizeParticleIndices(particleIndices);
          if (normalizedParticles.length > maxPoints) {
            onSelectionTooLarge?.(normalizedParticles.length);
            return;
          }

          const incomingPointIndices = await resolvePointIndices({
            queries,
            activeLayer,
            particleIndices: normalizedParticles,
          });
          if (requestId !== requestIdRef.current) return;

          if (incomingPointIndices.length > maxPoints) {
            onSelectionTooLarge?.(incomingPointIndices.length);
            return;
          }

          if (incomingPointIndices.length === 0 && chords.addToSelection) {
            return;
          }

          const pointIndices = chords.addToSelection
            ? mergeSelectionPointIndices(
                await readCommittedSelectedPointIndices(queries),
                incomingPointIndices,
              )
            : incomingPointIndices;
          if (requestId !== requestIdRef.current) return;
          if (pointIndices.length > maxPoints) {
            onSelectionTooLarge?.(pointIndices.length);
            return;
          }
          const visualParticleIndices = chords.addToSelection
            ? mergeSelectionPointIndices(
                useOrbFocusVisualStore.getState().selectionIndices,
                normalizedParticles,
              )
            : normalizedParticles;

          // Optimistic pending lane — lit immediately so the orb
          // shows the lasso result while DuckDB writes propagate.
          // The resolver clears this set once it has reconciled
          // selection_indices with a higher dispatchRevision.
          if (pointIndices.length > 0) {
            setPendingParticleIndices(visualParticleIndices, dispatchRevision);
          }

          await commitSelectionState({
            sourceId:
              pointIndices.length > 0 ? ORB_MANUAL_SELECTION_SOURCE_ID : null,
            queries,
            pointIndices,
            setSelectedPointCount,
            setActiveSelectionSourceId,
            scopeUpdate: {
              currentPointScopeSql:
                pointIndices.length > 0 ? SELECTED_POINT_INDICES_SCOPE_SQL : null,
              setCurrentPointScopeSql,
              forceRevision: true,
            },
            shouldCommitStore: () => requestId === requestIdRef.current,
            clearNode: () => {
              setFocusedPointIndex(null);
              selectNode(null);
            },
          });
          if (requestId === requestIdRef.current) {
            onSelectionCommitted?.(pointIndices.length);
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current) onSelectionFailed?.();
        });
    },
    [
      activeLayer,
      enabled,
      gate,
      maxPoints,
      onSelectionCommitted,
      onSelectionFailed,
      onSelectionTooLarge,
      queries,
      selectNode,
      setActiveSelectionSourceId,
      setCurrentPointScopeSql,
      setFocusedPointIndex,
      setPendingParticleIndices,
      setSelectedPointCount,
    ],
  );
}
