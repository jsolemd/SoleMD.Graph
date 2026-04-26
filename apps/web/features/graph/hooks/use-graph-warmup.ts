"use client";

import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type {
  GraphBundle,
  GraphBundleLoadProgress,
  GraphBundleQueries,
} from "@solemd/graph";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import { useGraphBundle } from "./use-graph-bundle";

export type GraphWarmupStatus = "ready" | "loading" | "unavailable";

export interface GraphWarmupState {
  canvas: GraphCanvasSource | null;
  connection: AsyncDuckDBConnection | null;
  graphError: Error | null;
  graphProgress: GraphBundleLoadProgress | null;
  graphReady: boolean;
  graphWarming: boolean;
  queries: GraphBundleQueries | null;
  status: GraphWarmupStatus;
}

export function useGraphWarmup(bundle: GraphBundle | null): GraphWarmupState {
  const { canvas, connection, error, loading, progress, queries } =
    useGraphBundle(bundle);
  const graphReady = !loading && canvas != null && queries != null;
  const status: GraphWarmupStatus =
    bundle == null || error != null
      ? "unavailable"
      : graphReady
        ? "ready"
        : "loading";

  return {
    canvas: graphReady ? canvas : null,
    connection: graphReady ? connection : null,
    graphError: error,
    graphProgress: progress,
    graphReady,
    graphWarming: status === "loading",
    queries: graphReady ? queries : null,
    status,
  };
}
