"use client";

import type { GraphBundle, GraphBundleLoadProgress } from "@/features/graph/types";
import { GraphLoadingExperience } from "./GraphLoadingExperience";

export function GraphBundleLoadingOverlay({
  bundle,
  progress,
  canvasReady,
}: {
  bundle: GraphBundle;
  progress: GraphBundleLoadProgress | null;
  canvasReady: boolean;
}) {
  return (
    <GraphLoadingExperience
      bundle={bundle}
      progress={progress}
      canvasReady={canvasReady}
    />
  );
}
