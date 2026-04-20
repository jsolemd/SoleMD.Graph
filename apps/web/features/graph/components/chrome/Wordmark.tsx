"use client";

import { useDashboardStore } from "@/features/graph/stores";
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
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const togglePanel = useDashboardStore((s) => s.togglePanel);

  return (
    <>
      <div className="absolute top-3 left-3 z-40">
        {!uiHidden && (
          <BrandWordmarkButton
            onClick={() => togglePanel("about")}
          />
        )}
      </div>
      <ChromeBar />
    </>
  );
}
