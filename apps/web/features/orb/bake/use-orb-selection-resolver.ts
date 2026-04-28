"use client";

import { useEffect, useRef } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { PARTICLE_STATE_CAPACITY } from "@/features/field/renderer/field-particle-state-texture";
import { useDashboardStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { queryResidentParticleRows } from "./resident-particle-query";

const SELECTED_PARTICLE_SQL = `
  SELECT sample.particleIdx
  FROM paper_sample sample
  JOIN selected_point_indices selected
    ON selected.index = sample.pointIndex
  ORDER BY sample.particleIdx
`;

export interface UseOrbSelectionResolverOptions {
  connection: AsyncDuckDBConnection | null;
  particleCount: number;
  enabled?: boolean;
  paperSampleReady: boolean;
}

function readParticleIndex(row: Record<string, unknown>): number | null {
  const value = Number(row.particleIdx);
  return Number.isInteger(value) ? value : null;
}

function normalizeParticleIndices(
  rows: Array<Record<string, unknown>>,
  particleCount: number,
): number[] {
  return Array.from(
    new Set(
      rows
        .map(readParticleIndex)
        .filter(
          (index): index is number =>
            index != null &&
            index >= 0 &&
            index < particleCount &&
            index < PARTICLE_STATE_CAPACITY,
        ),
    ),
  ).sort((a, b) => a - b);
}

/**
 * Bridges the canonical explicit graph selection into the orb's G lane.
 *
 * The selected set lives in DuckDB (`selected_point_indices`) and is
 * invalidated by `selectedPointRevision`. This resolver is the only
 * cross-renderer path from that table to resident orb particles, so native
 * Cosmograph widgets, entity overlays, RAG answers, and orb gestures all
 * light the 3D galaxy through the same `selectionIndices` store.
 */
export function useOrbSelectionResolver(
  options: UseOrbSelectionResolverOptions,
): void {
  const { connection, particleCount, enabled = true, paperSampleReady } = options;
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore(
    (s) => s.selectedPointRevision,
  );
  const setSelectionIndices = useOrbFocusVisualStore(
    (s) => s.setSelectionIndices,
  );
  const resolverRef = useRef<{
    schedule: (revision: number, count: number) => void;
    cancel: () => void;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      resolverRef.current = null;
      setSelectionIndices([]);
      return;
    }

    let cancelled = false;
    let pending:
      | {
          revision: number;
          count: number;
        }
      | undefined;
    let inFlight = false;
    let rafId: number | null = null;

    const clearFrame = () => {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };

    const applySelection = async (revision: number, count: number) => {
      if (count <= 0) {
        setSelectionIndices([]);
        return;
      }

      if (!connection || !paperSampleReady || particleCount <= 0) {
        setSelectionIndices([]);
        return;
      }

      try {
        const rows = await queryResidentParticleRows<Record<string, unknown>>(
          connection,
          SELECTED_PARTICLE_SQL,
        );
        const liveRevision = useDashboardStore.getState().selectedPointRevision;
        if (cancelled || pending !== undefined || liveRevision !== revision) {
          return;
        }
        setSelectionIndices(normalizeParticleIndices(rows, particleCount));
      } catch {
        if (!cancelled && pending === undefined) setSelectionIndices([]);
      }
    };

    const dispatchPending = () => {
      if (cancelled || pending === undefined) return;
      const next = pending;
      pending = undefined;
      inFlight = true;
      void applySelection(next.revision, next.count).finally(() => {
        inFlight = false;
        if (!cancelled && pending !== undefined) {
          schedule(pending.revision, pending.count);
        }
      });
    };

    const schedule = (revision: number, count: number) => {
      pending = { revision, count };
      if (cancelled || inFlight) return;
      clearFrame();
      if (count <= 0) {
        pending = undefined;
        setSelectionIndices([]);
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        dispatchPending();
      });
    };

    resolverRef.current = {
      schedule,
      cancel: () => {
        cancelled = true;
        clearFrame();
      },
    };
    schedule(
      useDashboardStore.getState().selectedPointRevision,
      useDashboardStore.getState().selectedPointCount,
    );

    return () => {
      cancelled = true;
      clearFrame();
      if (resolverRef.current?.schedule === schedule) {
        resolverRef.current = null;
      }
    };
  }, [
    enabled,
    paperSampleReady,
    particleCount,
    connection,
    setSelectionIndices,
  ]);

  useEffect(() => {
    if (!enabled) return;
    resolverRef.current?.schedule(selectedPointRevision, selectedPointCount);
  }, [enabled, selectedPointCount, selectedPointRevision]);
}

export { SELECTED_PARTICLE_SQL, normalizeParticleIndices };
