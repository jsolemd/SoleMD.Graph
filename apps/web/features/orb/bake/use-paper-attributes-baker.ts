"use client";

import { useEffect, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";

/**
 * Progressive paper-attribute streamer for the orb's paper-mode overlay
 * over the shared field substrate.
 *
 * One entry per particle index in [0, count). Sampled deterministically
 * via DuckDB `USING SAMPLE reservoir(<count>) REPEATABLE(<seed>)` so
 * particle → paper assignment is stable across mounts and reloads.
 * Spatial memory persists.
 *
 * ### Why streaming, not one big query
 *
 * The pre-5d implementation fired a single `connection.query(reservoir(...))`
 * which blocked until the full 16384-row sample was collected and
 * materialized in memory. At /graph entry that's a visible ~1–3s pause
 * before any paper can hydrate — the entire canvas sits motionless.
 *
 * 5d materializes the reservoir sample ONCE into a temp table
 * (`CREATE OR REPLACE TEMP TABLE paper_sample AS …`), then opens a
 * streaming read (`connection.send(sql, true)`) that emits Arrow
 * RecordBatches as DuckDB produces them. Each batch (~1–2k rows)
 * becomes a `PaperChunk` published to the orb geometry mutation store.
 * FieldScene's blob-geometry subscriber applies each chunk in order.
 *
 * Determinism is preserved (REPEATABLE seeds the reservoir; subsequent
 * streaming reads are in the ROW_NUMBER order we assigned when
 * materializing). Progressive delivery gives the user a smooth "paper
 * hydration" during landing scroll rather than a blocking pause at
 * /graph entry.
 *
 * ### Layout authority boundary
 *
 * This hook owns DuckDB interaction, chunk emission, and store writes.
 * It does NOT mutate geometry — that's `applyPaperAttributeOverrides`,
 * invoked by the blob-geometry subscriber whenever the store gains
 * chunks. Two separate responsibilities across the tree boundary.
 */

export interface PaperAttrs {
  paperId: string;
  clusterId: number;
  refCount: number;
  entityCount: number;
  relationCount: number;
  year: number | null;
}

export type PaperAttributesMap = Map<number, PaperAttrs>;

export interface PaperAttributesState {
  status: "idle" | "loading" | "streaming" | "ready" | "error";
  error: Error | null;
  /** Progress in [0, 1]. 0 before the first batch, 1 on stream close. */
  progress: number;
  /** Total particles sampled once streaming starts; null before. */
  count: number | null;
  /** Running maxima across all batches received so far. */
  maxima: { refCount: number; entityCount: number; relationCount: number } | null;
}

export interface UsePaperAttributesBakerOptions {
  /** DuckDB connection serving the active graph bundle's base_points_web view. */
  connection: AsyncDuckDBConnection | null;
  /** How many particles to sample. Defaults to 16384 (field Maze baseline). */
  count?: number;
  /**
   * Reservoir seed. Defaults to FIELD_SEED so particle→paper assignment is
   * stable across remounts. MUST stay in sync with the field bake seed so
   * scroll→orb transitions preserve particle identity.
   */
  seed?: number;
  /** Disables the hook (no query) when false. */
  enabled?: boolean;
}

const DEFAULT_COUNT = 16_384;
const DEFAULT_SEED = 20_260_418; // mirrors FIELD_SEED in point-source-registry

interface PaperRow {
  particle_idx: number;
  paper_id: string;
  cluster_id: number | null;
  paper_reference_count: number | null;
  paper_entity_count: number | null;
  paper_relation_count: number | null;
  year: number | null;
}

export function usePaperAttributesBaker(
  options: UsePaperAttributesBakerOptions,
): PaperAttributesState {
  const {
    connection,
    count = DEFAULT_COUNT,
    seed = DEFAULT_SEED,
    enabled = true,
  } = options;

  const [state, setState] = useState<PaperAttributesState>({
    status: "idle",
    error: null,
    progress: 0,
    count: null,
    maxima: null,
  });

  useEffect(() => {
    if (!enabled || !connection) {
      return;
    }

    let cancelled = false;
    const addChunk = useOrbGeometryMutationStore.getState().addChunk;
    setState((prev) => ({ ...prev, status: "loading", progress: 0 }));

    const run = async () => {
      try {
        // Step 1: materialize the reservoir sample as a temp table.
        // REPEATABLE makes the row set deterministic; ROW_NUMBER
        // assigns stable particle indices we stream in order. Temp
        // tables live on the connection, so re-runs on the same
        // connection skip the sample cost — but CREATE OR REPLACE
        // keeps the hook safe across remount.
        await connection.query(
          `CREATE OR REPLACE TEMP TABLE paper_sample AS
             WITH sampled AS (
               SELECT
                 paper_id,
                 cluster_id,
                 paper_reference_count,
                 paper_entity_count,
                 paper_relation_count,
                 year
               FROM base_points_web
               WHERE paper_id IS NOT NULL
               USING SAMPLE reservoir(${count} ROWS) REPEATABLE(${seed})
             )
             SELECT
               (ROW_NUMBER() OVER ()) - 1 AS particle_idx,
               *
             FROM sampled`,
        );
        if (cancelled) return;

        // Step 2: open a streaming read in particle_idx order so each
        // batch is a contiguous chunk of particles.
        const reader = await connection.send(
          `SELECT particle_idx, paper_id, cluster_id,
                  paper_reference_count, paper_entity_count,
                  paper_relation_count, year
             FROM paper_sample
             ORDER BY particle_idx`,
          true,
        );
        if (cancelled) {
          await reader.cancel?.();
          return;
        }

        setState((prev) => ({ ...prev, status: "streaming" }));

        let delivered = 0;
        let maxRef = 0;
        let maxEntity = 0;
        let maxRelation = 0;

        for await (const batch of reader) {
          if (cancelled) {
            await reader.cancel?.();
            return;
          }

          const attributes: PaperAttributesMap = new Map();
          let chunkMaxRef = 0;
          let chunkMaxEntity = 0;

          const rows = batch.toArray() as unknown as Array<
            PaperRow & { toJSON?: () => PaperRow }
          >;
          for (let i = 0; i < rows.length; i += 1) {
            const raw = rows[i]!;
            const row = typeof raw.toJSON === "function" ? raw.toJSON() : raw;
            const particleIdx = Number(row.particle_idx);
            if (!Number.isFinite(particleIdx)) continue;
            const refCount = Number(row.paper_reference_count ?? 0);
            const entityCount = Number(row.paper_entity_count ?? 0);
            const relationCount = Number(row.paper_relation_count ?? 0);

            if (refCount > chunkMaxRef) chunkMaxRef = refCount;
            if (entityCount > chunkMaxEntity) chunkMaxEntity = entityCount;
            if (refCount > maxRef) maxRef = refCount;
            if (entityCount > maxEntity) maxEntity = entityCount;
            if (relationCount > maxRelation) maxRelation = relationCount;

            attributes.set(particleIdx, {
              paperId: String(row.paper_id),
              clusterId: Number(row.cluster_id ?? 0) | 0,
              refCount,
              entityCount,
              relationCount,
              year: row.year == null ? null : Number(row.year),
            });
          }

          if (attributes.size === 0) continue;

          // Per-chunk maxima let the applier normalize without waiting
          // for the whole stream to finish. Visual consistency: later
          // chunks may contain higher-cited papers that shift the
          // distribution, but that's the price of progressive delivery.
          addChunk({
            attributes,
            maxima: { refCount: chunkMaxRef, entityCount: chunkMaxEntity },
          });

          delivered += attributes.size;
          setState((prev) => ({
            ...prev,
            count,
            progress: Math.min(1, delivered / count),
            maxima: {
              refCount: maxRef,
              entityCount: maxEntity,
              relationCount: maxRelation,
            },
          }));
        }

        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: "ready",
          progress: 1,
        }));
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          error:
            error instanceof Error
              ? error
              : new Error("Failed to stream paper attributes from base_points_web"),
          progress: 0,
          count: null,
          maxima: null,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [connection, count, seed, enabled]);

  return state;
}
