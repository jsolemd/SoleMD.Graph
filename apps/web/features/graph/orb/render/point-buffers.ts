"use client";

/**
 * Typed-array packing for the orb point cloud.
 *
 * Three strategies, in priority order:
 *
 *   1. `fixturePath != null`  → DuckDB `read_parquet('<path>')` against a
 *      baked `release_points_3d.parquet` (Lane A output). This is the real
 *      3D layout. Currently paused upstream (SPECTER2 embeddings aren't
 *      enriched yet), but the branch stays wired so the swap is a config
 *      change, not a code change.
 *
 *   2. `canvas != null` (default when no fixturePath) → sample real
 *      (paper_id, cluster_id) pairs from the existing `base_points`
 *      bundle table, pair each with a DETERMINISTIC synthetic unit-sphere
 *      xyz. The palette is also real: we pull `hex_color` from the bundle
 *      so cluster colors match the 2D map. This lets hover/click
 *      validate end-to-end against real paper_ids (the paper-title fetch,
 *      the store dispatch, the DuckDB `getPaperDocument` path) while only
 *      the xyz positions are synthetic.
 *
 *   3. `canvas == null` → pure unit-sphere mock with invented paper_ids.
 *      Only reached when the bundle isn't even loaded; in practice the
 *      surface gates on sessionReady so this is rarely visible.
 *
 * Swap contract: when the real parquet lands, setting
 * `NEXT_PUBLIC_ORB_DEV_FIXTURE_URL` flips to branch 1 automatically. No
 * OrbDevSurface or GraphOrb changes required.
 */

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { useEffect, useState } from "react";
import type { GraphCanvasSource } from "@/features/graph/duckdb/types";
import { orbClusterColor } from "./shaders";

export type OrbPointSource =
  | "parquet-fixture"
  | "sampled-base-points"
  | "fully-synthetic";

export interface OrbPointBuffers {
  /** Interleaved (x,y,z) positions on a unit sphere. */
  positions: Float32Array;
  /** Interleaved (r,g,b) color per point, from cluster_id palette. */
  colors: Float32Array;
  /** Scalar in [0, 1] — 1.0 == fully selected; live updates come later. */
  selection: Float32Array;
  /** Dense integer index (packed as float). Drives GPU picking encoding. */
  indices: Float32Array;
  /** Number of points actually packed (may be < requested on real data). */
  count: number;
  /** Dense row index → paper_id for click/hover dispatch. */
  indexToPaperId: Map<number, string>;
  /** Cluster ids per point (mirrors the color palette). */
  clusterIds: Uint32Array;
  /** Where positions came from — drives the UI banner. */
  source: OrbPointSource;
}

const DEFAULT_COUNT = 10_000;
const SAMPLE_SEED = 42; // keep runs deterministic so spatial memory works

interface UseOrbPointBuffersOptions {
  /**
   * Path to a `release_points_3d.parquet` style asset. When null the hook
   * samples real paper_ids from the bundle's base_points + synthesizes
   * deterministic xyz. This is the Lane A swap point.
   */
  fixturePath?: string | null;
  /** Number of points to render. Default 10 000. */
  count?: number;
  /** When false the hook is inert — useful while the session is loading. */
  enabled?: boolean;
}

export interface OrbPointBuffersState {
  data: OrbPointBuffers | null;
  status: "idle" | "loading" | "ready" | "error";
  error: Error | null;
  /** True when we fell back from parquet → sampled base_points. */
  fallbackUsed: boolean;
}

export function useOrbPointBuffers(
  canvas: GraphCanvasSource | null,
  options: UseOrbPointBuffersOptions = {},
): OrbPointBuffersState {
  const { fixturePath = null, count = DEFAULT_COUNT, enabled = true } = options;

  const [state, setState] = useState<OrbPointBuffersState>({
    data: null,
    status: "idle",
    error: null,
    fallbackUsed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    if (canvas == null) {
      // No session — fall all the way back to fully-synthetic to at least
      // exercise the render path while the bundle resolves.
      setState({
        data: packFullySynthetic(count),
        status: "ready",
        error: null,
        fallbackUsed: false,
      });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    const run = async () => {
      if (fixturePath) {
        try {
          const packed = await packFromParquetFixture(
            canvas.duckDBConnection.connection,
            fixturePath,
          );
          if (cancelled) return;
          setState({
            data: packed,
            status: "ready",
            error: null,
            fallbackUsed: false,
          });
          return;
        } catch (error) {
          // Fixture attach failed — fall through to sampled base_points.
          if (cancelled) return;
          try {
            const sampled = await packFromSampledBasePoints(
              canvas.duckDBConnection.connection,
              count,
            );
            if (cancelled) return;
            setState({
              data: sampled,
              status: "ready",
              error:
                error instanceof Error
                  ? error
                  : new Error("Failed to attach release_points_3d"),
              fallbackUsed: true,
            });
            return;
          } catch {
            // Even base_points failed — synthetic is the last resort.
            if (cancelled) return;
            setState({
              data: packFullySynthetic(count),
              status: "ready",
              error:
                error instanceof Error
                  ? error
                  : new Error("Failed to attach release_points_3d"),
              fallbackUsed: true,
            });
            return;
          }
        }
      }

      // Default branch: sample real paper_ids + cluster_ids from base_points.
      try {
        const sampled = await packFromSampledBasePoints(
          canvas.duckDBConnection.connection,
          count,
        );
        if (cancelled) return;
        setState({
          data: sampled,
          status: "ready",
          error: null,
          fallbackUsed: false,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          data: packFullySynthetic(count),
          status: "ready",
          error:
            error instanceof Error
              ? error
              : new Error("Failed to query base_points"),
          fallbackUsed: true,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, fixturePath, enabled]);

  return state;
}

/* ------------------------------------------------------------------ */
/* Deterministic PRNG — seeded mulberry32                             */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Cluster-ball sampler. Given a seed and number of visible centroids K,
 * produces deterministic centroids distributed in the interior of the unit
 * sphere (radius up to 0.6 so Gaussian tails stay inside the visible
 * volume). `sample(clusterId)` returns a Gaussian-offset position around
 * `centroids[|clusterId| % K]`.
 *
 * Used by both the fully-synthetic branch and the sampled-base-points
 * branch so the orb presents visible 3D cluster structure with real depth
 * variation — not a flat unit-sphere-surface distribution.
 */
const CLUSTER_CENTROID_RADIUS = 0.6; // inner radius for centroids
const CLUSTER_BALL_STDDEV = 0.11;    // Gaussian spread around each centroid

interface ClusterBallSampler {
  sample: (clusterId: number) => [number, number, number];
  numCentroids: number;
}

function clusterBallSampler(
  seed: number,
  numCentroids: number,
): ClusterBallSampler {
  const centroidRng = mulberry32(seed);
  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < numCentroids; i += 1) {
    // Uniform interior-sphere sample (rejection) for each centroid.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let r2 = 2;
    while (r2 > 1 || r2 === 0) {
      cx = centroidRng() * 2 - 1;
      cy = centroidRng() * 2 - 1;
      cz = centroidRng() * 2 - 1;
      r2 = cx * cx + cy * cy + cz * cz;
    }
    centroids.push([
      cx * CLUSTER_CENTROID_RADIUS,
      cy * CLUSTER_CENTROID_RADIUS,
      cz * CLUSTER_CENTROID_RADIUS,
    ]);
  }

  // Separate stream for per-point Gaussian offsets so centroid and point
  // generation don't consume each other's entropy.
  const offsetRng = mulberry32(seed ^ 0x13579bdf);
  const gaussian = (): number => {
    // Box-Muller pair — two uniforms into one standard normal.
    let u = 0;
    while (u === 0) u = offsetRng();
    const v = offsetRng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return {
    sample: (clusterId: number): [number, number, number] => {
      const idx = Math.abs(clusterId | 0) % numCentroids;
      const c = centroids[idx] ?? [0, 0, 0];
      return [
        c[0] + gaussian() * CLUSTER_BALL_STDDEV,
        c[1] + gaussian() * CLUSTER_BALL_STDDEV,
        c[2] + gaussian() * CLUSTER_BALL_STDDEV,
      ];
    },
    numCentroids,
  };
}

/**
 * Visible mock centroid count. Real fixtures (Lane A) have their own
 * position data and don't use this. For synthetic/real-id branches the
 * 831 base_clusters are bucketed into 36 visible clumps so the orb reads
 * as a structured volumetric cloud instead of a uniform shell.
 */
const MOCK_VISIBLE_CENTROIDS = 36;

/* ------------------------------------------------------------------ */
/* Branch 3 — fully synthetic (last-resort, no session)               */
/* ------------------------------------------------------------------ */

function packFullySynthetic(count: number): OrbPointBuffers {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const selection = new Float32Array(count);
  const indices = new Float32Array(count);
  const clusterIds = new Uint32Array(count);
  const indexToPaperId = new Map<number, string>();
  const MOCK_CLUSTERS = MOCK_VISIBLE_CENTROIDS;

  // Cluster-ball sampler — points distribute as Gaussian balls around
  // K centroids inside the unit sphere. Real depth, visible cluster
  // structure. See ClusterBallSampler comment for the full rationale.
  const sampler = clusterBallSampler(SAMPLE_SEED, MOCK_CLUSTERS);
  const colorScratch: [number, number, number] = [0, 0, 0];
  const clusterRng = mulberry32(SAMPLE_SEED ^ 0xabcdef);

  for (let i = 0; i < count; i += 1) {
    const clusterId = Math.floor(clusterRng() * MOCK_CLUSTERS);
    clusterIds[i] = clusterId;
    const [x, y, z] = sampler.sample(clusterId);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    orbClusterColor(clusterId, colorScratch);
    colors[i * 3 + 0] = colorScratch[0];
    colors[i * 3 + 1] = colorScratch[1];
    colors[i * 3 + 2] = colorScratch[2];

    selection[i] = 0;
    indices[i] = i;
    indexToPaperId.set(i, `mock-paper-${i}`);
  }

  return {
    positions,
    colors,
    selection,
    indices,
    count,
    indexToPaperId,
    clusterIds,
    source: "fully-synthetic",
  };
}

/* ------------------------------------------------------------------ */
/* Branch 2 — real paper_ids + cluster_ids, synthetic xyz             */
/* ------------------------------------------------------------------ */

interface SampledRow {
  paper_id: string;
  cluster_id: number | null;
  hex_color: string | null;
}

async function packFromSampledBasePoints(
  conn: AsyncDuckDBConnection,
  count: number,
): Promise<OrbPointBuffers> {
  // Sample a deterministic N from base_points. DuckDB's
  // `USING SAMPLE reservoir(<n> ROWS) REPEATABLE(<seed>)` is exact-count
  // and seedable. cluster_id 0 (or null) is the noise cluster — we keep it
  // so the palette matches the 2D map; the orb will show noise points in
  // a dedicated palette slot, same as Cosmograph.
  const result = await conn.query(
    `SELECT
       paper_id,
       cluster_id,
       hex_color
     FROM base_points
     WHERE paper_id IS NOT NULL
     USING SAMPLE reservoir(${count} ROWS) REPEATABLE(${SAMPLE_SEED})`,
  );

  const rows = result.toArray() as Array<SampledRow & {
    toJSON?: () => SampledRow;
  }>;

  if (rows.length === 0) {
    throw new Error(
      "base_points returned zero rows — cannot sample real paper_ids",
    );
  }

  const actualCount = rows.length;
  const positions = new Float32Array(actualCount * 3);
  const colors = new Float32Array(actualCount * 3);
  const selection = new Float32Array(actualCount);
  const indices = new Float32Array(actualCount);
  const clusterIds = new Uint32Array(actualCount);
  const indexToPaperId = new Map<number, string>();

  // Cluster-ball sampler — real cluster_ids hash into MOCK_VISIBLE_CENTROIDS
  // visible clumps. Same cluster_id always lands at the same centroid, so
  // colors and 3D position correlate even though base_points has 831
  // clusters (vs the 36 visible balls).
  const sampler = clusterBallSampler(SAMPLE_SEED, MOCK_VISIBLE_CENTROIDS);
  const fallbackColor: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < actualCount; i += 1) {
    const raw = rows[i]!;
    const row = typeof raw.toJSON === "function" ? raw.toJSON() : raw;

    const clusterId = Number(row.cluster_id ?? 0) | 0;
    clusterIds[i] = clusterId;

    const [x, y, z] = sampler.sample(clusterId);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Prefer the bundle's authoritative cluster color if present; fall
    // back to the procedural palette so orphan clusters still render.
    const parsed = parseHexColor(row.hex_color);
    if (parsed) {
      colors[i * 3 + 0] = parsed[0];
      colors[i * 3 + 1] = parsed[1];
      colors[i * 3 + 2] = parsed[2];
    } else {
      orbClusterColor(clusterId, fallbackColor);
      colors[i * 3 + 0] = fallbackColor[0];
      colors[i * 3 + 1] = fallbackColor[1];
      colors[i * 3 + 2] = fallbackColor[2];
    }

    selection[i] = 0;
    indices[i] = i;
    indexToPaperId.set(i, String(row.paper_id));
  }

  return {
    positions,
    colors,
    selection,
    indices,
    count: actualCount,
    indexToPaperId,
    clusterIds,
    source: "sampled-base-points",
  };
}

function parseHexColor(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^#/, "");
  if (trimmed.length !== 6) return null;
  const n = parseInt(trimmed, 16);
  if (!Number.isFinite(n)) return null;
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/* ------------------------------------------------------------------ */
/* Branch 1 — real parquet fixture (Lane A output)                    */
/* ------------------------------------------------------------------ */

interface ParquetRow {
  paper_id: string;
  x3: number;
  y3: number;
  z3: number;
  cluster_id: number;
}

async function packFromParquetFixture(
  conn: AsyncDuckDBConnection,
  fixturePath: string,
): Promise<OrbPointBuffers> {
  const escapedPath = fixturePath.replace(/'/g, "''");
  const viewName = "orb_dev_release_points_3d";

  await conn.query(
    `CREATE OR REPLACE VIEW ${viewName} AS
       SELECT *
       FROM read_parquet('${escapedPath}')`,
  );

  const result = await conn.query(
    `SELECT paper_id, x3, y3, z3, cluster_id
       FROM ${viewName}
       ORDER BY point_index`,
  );

  const rows = result.toArray() as Array<ParquetRow & {
    toJSON?: () => ParquetRow;
  }>;

  const count = rows.length;
  if (count === 0) {
    throw new Error(
      `release_points_3d at ${fixturePath} is empty — refusing to pack an empty orb`,
    );
  }

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const selection = new Float32Array(count);
  const indices = new Float32Array(count);
  const clusterIds = new Uint32Array(count);
  const indexToPaperId = new Map<number, string>();

  const colorScratch: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < count; i += 1) {
    const raw = rows[i]!;
    const row = typeof raw.toJSON === "function" ? raw.toJSON() : raw;

    const x = Number(row.x3);
    const y = Number(row.y3);
    const z = Number(row.z3);
    positions[i * 3 + 0] = Number.isFinite(x) ? x : 0;
    positions[i * 3 + 1] = Number.isFinite(y) ? y : 0;
    positions[i * 3 + 2] = Number.isFinite(z) ? z : 0;

    const clusterId = Number(row.cluster_id) | 0;
    clusterIds[i] = clusterId;
    orbClusterColor(clusterId, colorScratch);
    colors[i * 3 + 0] = colorScratch[0];
    colors[i * 3 + 1] = colorScratch[1];
    colors[i * 3 + 2] = colorScratch[2];

    selection[i] = 0;
    indices[i] = i;
    indexToPaperId.set(i, String(row.paper_id));
  }

  return {
    positions,
    colors,
    selection,
    indices,
    count,
    indexToPaperId,
    clusterIds,
    source: "parquet-fixture",
  };
}
