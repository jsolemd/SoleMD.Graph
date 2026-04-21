"use client";

import type { GraphBundle, GraphBundleLoadProgress } from "@solemd/graph";
import { useGraphBundle } from "./use-graph-bundle";

export type GraphWarmupStatus = "ready" | "loading" | "unavailable";

export interface GraphWarmupState {
  graphError: Error | null;
  graphProgress: GraphBundleLoadProgress | null;
  graphReady: boolean;
  graphWarming: boolean;
  status: GraphWarmupStatus;
}

export function useGraphWarmup(bundle: GraphBundle | null): GraphWarmupState {
  const { canvas, error, loading, progress, queries } = useGraphBundle(bundle);
  const graphReady = !loading && canvas != null && queries != null;
  const status: GraphWarmupStatus =
    bundle == null || error != null
      ? "unavailable"
      : graphReady
        ? "ready"
        : "loading";

  return {
    graphError: error,
    graphProgress: progress,
    graphReady,
    graphWarming: status === "loading",
    status,
  };
}
