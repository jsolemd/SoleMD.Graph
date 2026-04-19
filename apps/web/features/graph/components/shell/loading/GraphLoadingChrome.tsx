"use client";

import type { ReactNode } from "react";
import { BrandWordmarkButton } from "@/features/graph/components/chrome/BrandWordmarkButton";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";

interface GraphLoadingChromeProps {
  accentColor?: string;
  brandTooltipLabel?: string;
  onBrandClick?: () => void;
  rightSlot?: ReactNode;
  zIndex?: number;
}

export function GraphLoadingChrome({
  accentColor,
  brandTooltipLabel,
  onBrandClick,
  rightSlot,
  zIndex = 70,
}: GraphLoadingChromeProps = {}) {
  const mode = useGraphStore((s) => s.mode);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const modeColor = accentColor ?? getModeConfig(mode).color;
  const handleBrandClick = onBrandClick ?? (() => togglePanel("about"));
  const brandLabel = brandTooltipLabel ?? "About SoleMD";

  return (
    <>
      <div className="fixed left-3 top-3" style={{ zIndex }}>
        <BrandWordmarkButton
          accentColor={modeColor}
          onClick={handleBrandClick}
          tooltipLabel={brandLabel}
        />
      </div>

      <div
        className="fixed right-3 top-3 flex items-center gap-2"
        style={{ zIndex }}
      >
        {rightSlot}
        <ThemeToggle />
      </div>
    </>
  );
}
