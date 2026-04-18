"use client";

import { selectBottomObstacles, useDashboardStore } from "@/features/graph/stores";
import { APP_CHROME_PX } from "@/lib/density";

export interface MobileBottomStack {
  promptBottom: number;
  bottomClearance: number;
}

export function resolveMobileBottomStack(bottomObstacles: number): MobileBottomStack {
  const promptBottom = bottomObstacles + APP_CHROME_PX.edgeMargin;
  return {
    promptBottom,
    bottomClearance: promptBottom,
  };
}

export function useMobileBottomStack(): MobileBottomStack {
  const bottomObstacles = useDashboardStore(selectBottomObstacles);
  return resolveMobileBottomStack(bottomObstacles);
}
