"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";

/**
 * Syncs the active mode's accent color to CSS custom properties on <html>.
 * Components use var(--mode-accent) and its derived tokens instead of
 * hardcoding mode-specific colors.
 *
 * Derived tokens (computed via color-mix in globals.css):
 *   --mode-accent          Full accent color
 *   --mode-accent-subtle   ~10% opacity (fills, backgrounds)
 *   --mode-accent-hover    ~18% opacity (hover states)
 *   --mode-accent-border   ~30% opacity (borders)
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
