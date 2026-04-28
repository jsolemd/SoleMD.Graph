"use client";

import { useEffect, useRef } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { useDashboardStore } from "@/features/graph/stores";
import {
  hasCurrentPointScopeSql,
  normalizeCurrentPointScopeSql,
} from "@/features/graph/lib/selection-query-state";
import {
  clearLane,
  PARTICLE_STATE_CAPACITY,
  writeLane,
} from "@/features/field/renderer/field-particle-state-texture";
import { useOrbScopeMutationStore } from "../stores/scope-mutation-store";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { queryResidentParticleRows } from "./resident-particle-query";

/**
 * Resolves the active filter / timeline scope clause to the per-
 * particle R lane of the field's particle-state texture (1.0 = in
 * scope, 0.0 = out of scope) and notifies subscribers via the
 * scope-mutation store.
 *
 * ### Pipeline reuse
 *
 * Slice 8 reuses, not rebuilds:
 *   - `currentPointScopeSql` from the existing selection slice — the
 *     same Mosaic-rendered fragment that powers Cosmograph 2D scope.
 *     We do NOT reconstruct it from filter + timeline state.
 *   - `queryResidentParticleRows` over the active serialized DuckDB
 *     connection for the lookup. This intentionally avoids the SQL
 *     explorer's `runReadOnlyQuery` row cap; the visual mask needs one
 *     row per rendered paper particle.
 *   - `paper_sample` (built by `usePaperAttributesBaker`) for the
 *     particleIdx ↔ id mapping. The resolver runs only after the
 *     paper baker has materialized that temp table.
 *   - The shared `field-particle-state-texture` module singleton —
 *     no parallel mask system, no per-particle attribute lane.
 *
 * ### Particle scope semantics
 *
 * The field has 16384 particles; the paper baker assigns the first N
 * to sampled papers, leaving the remainder as ambient/non-paper
 * particles. Only paper-mode particles (those present in
 * `paper_sample`) participate in the dim — ambient particles stay at
 * the lands-mode default of 1.0 so the canvas keeps its spatial
 * texture even when the filter narrows the paper subset to zero.
 *
 * ### Lifecycle
 *
 * - `currentPointScopeSql === null` → reset every R lane to 255 (no
 *   dim). No DuckDB roundtrip.
 * - SQL changes → rAF + 50ms trailing coalesced resolve. At most one
 *   DuckDB query is in flight; intermediate changes collapse to the
 *   latest pending scope SQL.
 * - Bundle / connection swap → the parent unmount clears the store
 *   so a stale mask doesn't replay on the next mount.
 */

const PAPER_SAMPLE_TABLE = "paper_sample";
const SCOPE_RESOLVE_DEBOUNCE_MS = 50;

function buildScopeResolutionSql(currentPointScopeSql: string): string {
  // INVARIANT: currentPointScopeSql is always Mosaic-generated (see
  // buildCurrentPointScopeSql) — never raw user input — so template
  // interpolation here is safe. One query returns every paper particle
  // with a boolean scope flag, avoiding a second pass to discover
  // non-paper indices.
  return `
    SELECT
      particleIdx,
      id IN (
        SELECT id FROM current_points_web WHERE ${currentPointScopeSql}
      ) AS in_scope
    FROM ${PAPER_SAMPLE_TABLE}
  `;
}

export interface UseOrbScopeResolverOptions {
  connection: AsyncDuckDBConnection | null;
  /** Particle count for the field geometry; bounds the mask writes. */
  particleCount: number;
  /** Disables the hook (no query) when false. */
  enabled?: boolean;
  /**
   * Set true once `usePaperAttributesBaker` has written its temp
   * table. The resolver short-circuits until then because the table
   * doesn't exist yet — querying it would throw.
   */
  paperSampleReady: boolean;
}

export function useOrbScopeResolver(options: UseOrbScopeResolverOptions): void {
  const { connection, particleCount, enabled = true, paperSampleReady } = options;
  const setScopeIndices = useOrbFocusVisualStore((s) => s.setScopeIndices);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const currentScopeRevision = useDashboardStore((s) => s.currentScopeRevision);
  const selectedPointRevision = useDashboardStore(
    (s) => s.selectedPointRevision,
  );
  const selectedScopeRevision = currentPointScopeSql?.includes(
    "selected_point_indices",
  )
    ? selectedPointRevision
    : 0;
  const schedulerRef = useRef<{
    scheduleResolve: (sql: string | null) => void;
    cancel: () => void;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      schedulerRef.current = null;
      return;
    }

    let cancelled = false;
    let pendingSql: string | null | undefined;
    let inFlight = false;
    let rafId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const clearFrame = () => {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };

    const clearTimer = () => {
      if (timerId == null) return;
      clearTimeout(timerId);
      timerId = null;
    };

    const applyFullVisibility = () => {
      clearLane("R");
      setScopeIndices([]);
      useOrbScopeMutationStore.getState().bumpScopeRevision();
    };

    const applyScopeSql = async (sql: string | null) => {
      if (sql == null) {
        applyFullVisibility();
        return;
      }

      if (!connection || !paperSampleReady || particleCount <= 0) return;

      try {
        const rows = await queryResidentParticleRows<{
          particleIdx: number;
          in_scope: boolean | 0 | 1;
        }>(connection, buildScopeResolutionSql(sql));
        const liveSql = normalizeCurrentPointScopeSql(
          useDashboardStore.getState().currentPointScopeSql,
        );
        if (cancelled || pendingSql !== undefined || liveSql !== sql) return;

        // Initialize all particles to in-scope only after the query
        // returns and is still current. If a newer scope arrived while
        // this query was in-flight, keep the existing texture untouched
        // until the latest scope lands.
        clearLane("R");

        const scopeIndices: number[] = [];
        for (const row of rows) {
          const idx = Number(row.particleIdx);
          if (
            !Number.isInteger(idx) ||
            idx < 0 ||
            idx >= particleCount ||
            idx >= PARTICLE_STATE_CAPACITY
          ) {
            continue;
          }
          if (row.in_scope === false || row.in_scope === 0) {
            writeLane("R", idx, 0);
          } else {
            scopeIndices.push(idx);
          }
        }

        if (!cancelled) {
          setScopeIndices(scopeIndices);
          useOrbScopeMutationStore.getState().bumpScopeRevision();
        }
      } catch {
        // Defensive: a stale connection or torn-down bundle yields
        // an unsurprising failure here. Fall back to full visibility
        // rather than leaving the user with a frozen dim mask.
        if (process.env.NODE_ENV !== "production") {
          console.warn("[OrbScopeResolver] Failed to resolve resident scope.");
        }
        if (!cancelled && pendingSql === undefined) applyFullVisibility();
      }
    };

    const dispatchPending = () => {
      timerId = null;
      if (cancelled || pendingSql === undefined) return;

      const sql = pendingSql;
      pendingSql = undefined;
      inFlight = true;

      void applyScopeSql(sql).finally(() => {
        inFlight = false;
        if (!cancelled && pendingSql !== undefined) {
          scheduleResolve(pendingSql);
        }
      });
    };

    const scheduleResolve = (sql: string | null) => {
      pendingSql = hasCurrentPointScopeSql(sql) ? sql : null;
      if (cancelled || inFlight) return;

      clearFrame();
      clearTimer();
      if (pendingSql == null) {
        pendingSql = undefined;
        applyFullVisibility();
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        timerId = setTimeout(dispatchPending, SCOPE_RESOLVE_DEBOUNCE_MS);
      });
    };

    schedulerRef.current = {
      scheduleResolve,
      cancel: () => {
        cancelled = true;
        clearFrame();
        clearTimer();
      },
    };
    scheduleResolve(useDashboardStore.getState().currentPointScopeSql);

    return () => {
      cancelled = true;
      clearFrame();
      clearTimer();
      if (schedulerRef.current?.scheduleResolve === scheduleResolve) {
        schedulerRef.current = null;
      }
    };
  }, [enabled, connection, particleCount, paperSampleReady, setScopeIndices]);

  useEffect(() => {
    if (!enabled) return;
    schedulerRef.current?.scheduleResolve(currentPointScopeSql);
  }, [enabled, currentPointScopeSql, currentScopeRevision, selectedScopeRevision]);
}
