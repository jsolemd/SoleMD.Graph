"use client";

import { useEffect, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import {
  useOrbGeometryMutationStore,
  type PaperCorpusStats,
} from "../stores/geometry-mutation-store";
import { ORB_PARTICLE_CAPACITY } from "./orb-particle-constants";

/**
 * Progressive paper-attribute streamer for the WebGPU orb.
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
 * before any paper can hydrate.
 *
 * 5d materializes the reservoir sample ONCE into a temp table
 * (`CREATE OR REPLACE TEMP TABLE paper_sample AS …`), then opens a
 * streaming read (`connection.send(sql, true)`) that emits Arrow
 * RecordBatches as DuckDB produces them. Each batch (~1–2k rows)
 * becomes a `PaperChunk` published to the orb geometry mutation store.
 * OrbWebGpuCanvas packs those chunks into storage-buffer arrays.
 *
 * Determinism is preserved (REPEATABLE seeds the reservoir; subsequent
 * streaming reads are in the ROW_NUMBER order we assigned when
 * materializing). Progressive delivery gives the user a smooth paper
 * hydration rather than a blocking pause at /graph entry.
 *
 * ### Layout authority boundary
 *
 * This hook owns DuckDB interaction, chunk emission, and store writes.
 * It does NOT mutate GPU buffers directly. OrbWebGpuCanvas owns the
 * canvas/device and uploads packed buffer data when chunks change.
 */

export interface PaperAttrs {
  paperId: string;
  pointId?: string;
  clusterId: number;
  x?: number;
  y?: number;
  displayLabel?: string;
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
  /**
   * Corpus-wide log-space percentile anchors used to normalize size and
   * speed. Computed once before streaming and reused for every chunk.
   * Null until the pre-flight stats query resolves.
   */
  stats: PaperCorpusStats | null;
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

const DEFAULT_COUNT = ORB_PARTICLE_CAPACITY;
const DEFAULT_SEED = 20_260_418; // mirrors FIELD_SEED in point-source-registry

interface PaperRow {
  particleIdx: number;
  id: string;
  paperId: string;
  clusterId: number | null;
  x: number | null;
  y: number | null;
  displayLabel: string | null;
  paperReferenceCount: number | null;
  paperEntityCount: number | null;
  paperRelationCount: number | null;
  year: number | null;
}

interface QuantilePair {
  // DuckDB's `quantile_cont(x, [0.05, 0.98])` returns a LIST<DOUBLE>
  // exposed by Arrow as an array-like with .get(i) or numeric index
  // depending on the runtime. Normalize via toArray() in the reader.
  toArray?: () => number[];
  [index: number]: number;
}

interface StatsRow {
  refQuantiles: QuantilePair;
  entityQuantiles: QuantilePair;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
}

function toQuantilePair(value: unknown): [number, number] {
  if (value && typeof (value as QuantilePair).toArray === "function") {
    const arr = (value as QuantilePair).toArray!();
    return [Number(arr[0] ?? 0), Number(arr[1] ?? 0)];
  }
  if (Array.isArray(value)) {
    return [Number(value[0] ?? 0), Number(value[1] ?? 0)];
  }
  // Defensive: a malformed result shouldn't crash the baker. Returning
  // a degenerate pair lets the applier fall back to a near-zero range
  // (which the EPS guard handles) rather than throwing.
  return [0, 0];
}

function readStatsFromArrowRow(table: {
  toArray: () => unknown[];
}): PaperCorpusStats {
  const rows = table.toArray() as StatsRow[];
  const row = rows[0];
  if (!row) {
    return { refLo: 0, refHi: 0, entityLo: 0, entityHi: 0 };
  }
  const [refLo, refHi] = toQuantilePair(row.refQuantiles);
  const [entityLo, entityHi] = toQuantilePair(row.entityQuantiles);
  return {
    refLo,
    refHi,
    entityLo,
    entityHi,
    xMin: Number(row.xMin ?? 0),
    xMax: Number(row.xMax ?? 0),
    yMin: Number(row.yMin ?? 0),
    yMax: Number(row.yMax ?? 0),
  };
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
    stats: null,
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
        // Step 1: pre-flight corpus-wide percentile anchors. Computed
        // once on log1p-transformed counts so the heavy tail doesn't
        // collapse the visual scale. q05/q98 anchors ignore pathological
        // outliers. These same anchors are reused for every chunk, so
        // an already-painted particle never silently changes scale when
        // later chunks arrive — a precondition for the future physics
        // layer. ~5–15ms over 16k rows in DuckDB-WASM.
        const statsResult = await connection.query(
          `SELECT
             quantile_cont(LN(1 + paperReferenceCount), [0.05, 0.98]) AS refQuantiles,
             quantile_cont(LN(1 + paperEntityCount),    [0.05, 0.98]) AS entityQuantiles,
             MIN(x) AS xMin,
             MAX(x) AS xMax,
             MIN(y) AS yMin,
             MAX(y) AS yMax
           FROM base_points_web
           WHERE paperId IS NOT NULL`,
        );
        if (cancelled) return;

        const stats = readStatsFromArrowRow(statsResult);
        setState((prev) => ({ ...prev, stats }));

        // Step 2: materialize the reservoir sample as a temp table.
        // REPEATABLE makes the row set deterministic; the ROW_NUMBER
        // assigns stable particle indices we stream in order. ORDER BY
        // id inside OVER() makes the index assignment durable across
        // reloads of the same bundle — particle #N always corresponds
        // to the same paper. Temp tables live on the connection, so
        // re-runs on the same connection skip the sample cost — but
        // CREATE OR REPLACE keeps the hook safe across remount.
        await connection.query(
          `CREATE OR REPLACE TEMP TABLE paper_sample AS
             WITH sampled AS (
               SELECT
                 index AS pointIndex,
                 id,
                 paperId,
                 clusterId,
                 x,
                 y,
                 displayLabel,
                 paperReferenceCount,
                 paperEntityCount,
                 paperRelationCount,
                 year
               FROM base_points_web
               WHERE paperId IS NOT NULL
               USING SAMPLE reservoir(${count} ROWS) REPEATABLE(${seed})
             )
             SELECT
               (ROW_NUMBER() OVER (ORDER BY id)) - 1 AS particleIdx,
               *
             FROM sampled`,
        );
        if (cancelled) return;

        // Step 3: open a streaming read in particleIdx order so each
        // batch is a contiguous chunk of particles.
        const reader = await connection.send(
          `SELECT particleIdx, id, paperId, clusterId, x, y, displayLabel,
                  paperReferenceCount, paperEntityCount,
                  paperRelationCount, year
             FROM paper_sample
             ORDER BY particleIdx`,
          true,
        );
        if (cancelled) {
          await reader.cancel?.();
          return;
        }

        setState((prev) => ({ ...prev, status: "streaming" }));

        let delivered = 0;

        for await (const batch of reader) {
          if (cancelled) {
            await reader.cancel?.();
            return;
          }

          const attributes: PaperAttributesMap = new Map();

          const rows = batch.toArray() as unknown as Array<
            PaperRow & { toJSON?: () => PaperRow }
          >;
          for (let i = 0; i < rows.length; i += 1) {
            const raw = rows[i]!;
            const row = typeof raw.toJSON === "function" ? raw.toJSON() : raw;
            const particleIdx = Number(row.particleIdx);
            if (!Number.isFinite(particleIdx)) continue;
            const refCount = Number(row.paperReferenceCount ?? 0);
            const entityCount = Number(row.paperEntityCount ?? 0);
            const relationCount = Number(row.paperRelationCount ?? 0);

            attributes.set(particleIdx, {
              paperId: String(row.paperId),
              pointId: String(row.id),
              clusterId: Number(row.clusterId ?? 0) | 0,
              x: Number(row.x ?? 0),
              y: Number(row.y ?? 0),
              displayLabel: String(row.displayLabel ?? row.paperId ?? row.id),
              refCount,
              entityCount,
              relationCount,
              year: row.year == null ? null : Number(row.year),
            });
          }

          if (attributes.size === 0) continue;

          // Same corpus stats on every chunk — already-painted
          // particles never need re-normalization, and the future
          // physics layer can read mass off these values without
          // worrying about chunk-membership artifacts.
          addChunk({ attributes, stats });

          delivered += attributes.size;
          setState((prev) => ({
            ...prev,
            count,
            progress: Math.min(1, delivered / count),
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
          stats: null,
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
