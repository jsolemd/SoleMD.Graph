"use client";
import { useCallback } from "react";
import { useCosmograph } from "@cosmograph/react";

export function useGraphExport() {
  const { cosmograph } = useCosmograph();

  const captureScreenshot = useCallback((filename = "solemd-graph.png") => {
    cosmograph?.captureScreenshot(filename);
  }, [cosmograph]);

  return { captureScreenshot };
}
