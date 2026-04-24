"use client";

import { useEffect, useState } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/**
 * Sampled paper attributes for the orb's paper-mode overlay over the
 * shared field substrate.
 *
 * One entry per particle index in [0, count). Sampled deterministically
 * via DuckDB `USING SAMPLE reservoir(<count>) REPEATABLE(<seed>)` so
 * particle → paper assignment is stable across mounts and reloads.
 * Spatial memory persists.
 *
 * Layout authority boundary: this hook queries DuckDB and emits a Map
 * the orb baker reads. It does NOT mutate the geometry — that's what
 * `applyPaperAttributeOverrides` does. Two separate responsibilities.
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
  /** Map<particleIndex, PaperAttrs>, or null while loading/errored. */
  data: PaperAttributesMap | null;
  status: "idle" | "loading" | "ready" | "error";
  error: Error | null;
  /** Max values useful for normalizers — null until ready. */
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
    data: null,
    status: "idle",
    error: null,
    maxima: null,
  });

  useEffect(() => {
    if (!enabled || !connection) {
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    const run = async () => {
      try {
        const result = await connection.query(
          `SELECT
             paper_id,
             cluster_id,
             paper_reference_count,
             paper_entity_count,
             paper_relation_count,
             year
           FROM base_points_web
           WHERE paper_id IS NOT NULL
           USING SAMPLE reservoir(${count} ROWS) REPEATABLE(${seed})`,
        );

        if (cancelled) return;

        const rows = result.toArray() as Array<
          PaperRow & { toJSON?: () => PaperRow }
        >;

        const data: PaperAttributesMap = new Map();
        let maxRef = 0;
        let maxEntity = 0;
        let maxRelation = 0;

        for (let i = 0; i < rows.length; i += 1) {
          const raw = rows[i]!;
          const row = typeof raw.toJSON === "function" ? raw.toJSON() : raw;
          const refCount = Number(row.paper_reference_count ?? 0);
          const entityCount = Number(row.paper_entity_count ?? 0);
          const relationCount = Number(row.paper_relation_count ?? 0);

          if (refCount > maxRef) maxRef = refCount;
          if (entityCount > maxEntity) maxEntity = entityCount;
          if (relationCount > maxRelation) maxRelation = relationCount;

          data.set(i, {
            paperId: String(row.paper_id),
            clusterId: Number(row.cluster_id ?? 0) | 0,
            refCount,
            entityCount,
            relationCount,
            year: row.year == null ? null : Number(row.year),
          });
        }

        setState({
          data,
          status: "ready",
          error: null,
          maxima: {
            refCount: maxRef,
            entityCount: maxEntity,
            relationCount: maxRelation,
          },
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          data: null,
          status: "error",
          error:
            error instanceof Error
              ? error
              : new Error("Failed to sample paper attributes from base_points_web"),
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
