"use client";

import { useMemo } from "react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { resolveGraphControlContrastLevel } from "@/features/graph/lib/control-contrast";

/**
 * Tailwind backdrop-blur class per contrast level.
 *
 * backdrop-filter is non-inheritable, so it can't flow through CSS custom
 * properties on the parent container like the other contrast tokens.
 * Tailwind's own `--tw-backdrop-blur` variable is registered with
 * `inherits: false`, which blocks inheritance even with explicit `inherit`.
 * Lightning CSS also strips any `backdrop-filter: blur(var(...))` whose
 * @property initial-value resolves to blur(0px) (a no-op).
 *
 * Using the `[&_.graph-icon-btn]:` arbitrary variant targets child buttons
 * from the contrast container — keeping the single-source hook pattern.
 */
const BLUR_CLASS: Record<0 | 1 | 2, string> = {
  0: "",
  1: "[&_.graph-icon-btn]:backdrop-blur-sm",
  2: "[&_.graph-icon-btn]:backdrop-blur-md",
};

export function useGraphControlContrast() {
  const graphContentContrastLevel = useGraphStore(
    (s) => s.graphContentContrastLevel,
  );
  const focusedPointIndex = useGraphStore((s) => s.focusedPointIndex);
  const hasSelection = useDashboardStore((s) => s.selectedPointCount > 0);

  const contrastLevel = useMemo(
    () =>
      resolveGraphControlContrastLevel({
        graphContentContrastLevel,
        hasFocusedPoint: focusedPointIndex != null,
        hasSelection,
      }),
    [focusedPointIndex, graphContentContrastLevel, hasSelection],
  );

  return {
    contrastLevel,
    /** Data attribute for CSS custom property overrides + blur class. */
    contrastAttr: {
      "data-graph-control-contrast": String(contrastLevel),
    } as const,
    /** Tailwind backdrop-blur class targeting child .graph-icon-btn elements. */
    contrastBlurClass: BLUR_CLASS[contrastLevel],
  };
}
