"use client";

import type { CSSProperties, ReactNode } from "react";
import { BrandWordmarkButton } from "@/features/graph/components/chrome/BrandWordmarkButton";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { useDashboardStore } from "@/features/graph/stores";
import { densityCssPx } from "@/lib/density";
import {
  chromeFlushSurfaceStyle,
  chromePillSurfaceStyle,
} from "../../panels/PanelShell";
import type { ChromeSurfaceMode } from "../../panels/PanelShell";

interface GraphLoadingChromeProps {
  brandTooltipLabel?: string;
  groupRightControls?: boolean;
  onBrandClick?: () => void;
  rightSlot?: ReactNode;
  surfaceMode?: ChromeSurfaceMode;
  zIndex?: number;
}

const flushRightChromeStyle: CSSProperties = {
  ...chromeFlushSurfaceStyle,
  padding: densityCssPx(3),
} as CSSProperties;

const pillRightChromeStyle: CSSProperties = {
  ...chromePillSurfaceStyle,
  padding: densityCssPx(3),
} as CSSProperties;

export function GraphLoadingChrome({
  brandTooltipLabel,
  groupRightControls = false,
  onBrandClick,
  rightSlot,
  surfaceMode = "pill",
  zIndex = 70,
}: GraphLoadingChromeProps = {}) {
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const handleBrandClick = onBrandClick ?? (() => togglePanel("about"));
  const brandLabel = brandTooltipLabel ?? "About SoleMD";

  return (
    <>
      <div className="fixed left-3 top-3" style={{ zIndex }}>
        <BrandWordmarkButton
          onClick={handleBrandClick}
          surfaceMode={surfaceMode}
          tooltipLabel={brandLabel}
        />
      </div>

      <div className="fixed right-3 top-3" style={{ zIndex }}>
        {groupRightControls ? (
          <div
            className={
              "flex items-center gap-0.5 rounded-full transition-[background-color,box-shadow] duration-300"
              + (surfaceMode === "auto" ? " chrome-surface-right-target" : "")
            }
            style={
              surfaceMode === "auto"
                ? undefined
                : surfaceMode === "pill"
                  ? pillRightChromeStyle
                  : flushRightChromeStyle
            }
          >
            {rightSlot}
            <ThemeToggle grouped surfaceMode={surfaceMode} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {rightSlot}
            <ThemeToggle surfaceMode={surfaceMode} />
          </div>
        )}
      </div>
    </>
  );
}
