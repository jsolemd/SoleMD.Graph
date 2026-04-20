"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";

/**
 * Syncs the active mode's accent color to CSS custom properties on <html>.
 * Components use var(--mode-accent) and its derived tokens instead of
 * hardcoding mode-specific colors.
 *
 * Derived tokens (computed via color-mix in tokens.css):
 *   --mode-accent          Full accent color — toggle-ON fills, accent borders
 *   --mode-accent-subtle   Resting active/selected fill (~55%)
 *   --mode-accent-hover    Mouse-over affordance (~78%)
 *
 * Sibling of DarkClassSync — mount once in the provider tree.
 */
export function ModeColorSync() {
  const mode = useGraphStore((s) => s.mode);

  useEffect(() => {
    const { colorVar } = getModeConfig(mode);
    document.documentElement.style.setProperty(
      "--mode-accent",
      `var(${colorVar})`
    );
  }, [mode]);

  return null;
}
