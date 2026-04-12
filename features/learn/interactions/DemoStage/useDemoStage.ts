"use client";

import { useMemo } from "react";

export interface UseDemoStageConfig {
  layout?: "horizontal" | "vertical";
}

export interface DemoStageState {
  layout: "horizontal" | "vertical";
}

/**
 * Minimal hook for DemoStage - primarily a layout/composition shell.
 * Exists for pattern consistency with the other interaction shells.
 */
export function useDemoStage({
  layout = "horizontal",
}: UseDemoStageConfig = {}): DemoStageState {
  return useMemo(() => ({ layout }), [layout]);
}
