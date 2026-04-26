"use client";
import { useCallback } from "react";
import { useCosmographInternal } from "@cosmograph/react";

export function useGraphExport() {
  // Null-tolerant: see use-graph-camera.ts for rationale. captureScreenshot
  // already guards via `?.`.
  const cosmograph = useCosmographInternal()?.cosmograph;

  const captureScreenshot = useCallback((filename = "solemd-graph.png") => {
    cosmograph?.captureScreenshot(filename);
  }, [cosmograph]);

  return { captureScreenshot };
}
