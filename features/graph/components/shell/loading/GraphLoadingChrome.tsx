"use client";

import { BrandWordmarkButton } from "@/features/graph/components/chrome/BrandWordmarkButton";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";

export function GraphLoadingChrome() {
  const mode = useGraphStore((s) => s.mode);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const modeColor = getModeConfig(mode).color;

  return (
    <>
      <div
        className="fixed left-3 top-3 z-[70]"
        data-graph-control-contrast="1"
      >
        <BrandWordmarkButton
          accentColor={modeColor}
          onClick={() => togglePanel("about")}
        />
      </div>

      <div
        className="fixed right-3 top-3 z-[70]"
        data-graph-control-contrast="1"
      >
        <ThemeToggle />
      </div>
    </>
  );
}
