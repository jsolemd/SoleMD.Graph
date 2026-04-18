"use client";

import type { GraphInfoScope } from "@solemd/graph";

export function resolveWidgetBaselineScope(args: {
  selectionLocked: boolean;
  selectedPointCount: number;
  selectedPointRevision: number;
}): {
  scope: Extract<GraphInfoScope, "dataset" | "selected">;
  cacheKey: string;
} {
  const useSelectedBaseline =
    args.selectionLocked && args.selectedPointCount > 0;

  return {
    scope: useSelectedBaseline ? "selected" : "dataset",
    cacheKey: useSelectedBaseline
      ? `selected:${args.selectedPointRevision}`
      : "dataset",
  };
}
