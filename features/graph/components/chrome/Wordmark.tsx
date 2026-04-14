"use client";

import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { BrandWordmarkButton } from "./BrandWordmarkButton";
import { ChromeBar } from "./ChromeBar";

/**
 * Top chrome orchestrator: brand wordmark (top-left) + icon pills (top-right).
 * Mobile and desktop share the same pill structure via `ChromeBar`; desktop
 * lays out canvas + selection tools inline while mobile collapses them into
 * tray menus. The bottom-left toolbar was retired to keep the viewport clear
 * on both platforms.
 */
export function Wordmark() {
  const mode = useGraphStore((s) => s.mode);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const modeColor = getModeConfig(mode).color;

  return (
    <>
      <div className="absolute top-3 left-3 z-40">
        {!uiHidden && (
          <BrandWordmarkButton
            accentColor={modeColor}
            onClick={() => togglePanel("about")}
          />
        )}
      </div>
      <ChromeBar />
    </>
  );
}
