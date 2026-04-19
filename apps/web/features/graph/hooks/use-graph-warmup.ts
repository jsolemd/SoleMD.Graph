"use client";

import type { GraphBundle, GraphBundleLoadProgress } from "@solemd/graph";
import { useGraphBundle } from "./use-graph-bundle";

export interface GraphWarmupState {
  graphError: Error | null;
  graphProgress: GraphBundleLoadProgress | null;
  graphReady: boolean;
  graphWarming: boolean;
}

export function useGraphWarmup(bundle: GraphBundle): GraphWarmupState {
  const { canvas, error, loading, progress, queries } = useGraphBundle(bundle);
  const graphReady = !loading && canvas != null && queries != null;

  return {
    graphError: error,
    graphProgress: progress,
    graphReady,
    graphWarming: !graphReady && error == null,
  };
}
