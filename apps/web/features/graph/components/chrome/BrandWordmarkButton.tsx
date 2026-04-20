"use client";

import { Tooltip } from "@mantine/core";
import {
  chromeFlushSurfaceStyle,
  promptSurfaceStyle,
  type ChromeSurfaceMode,
} from "../panels/PanelShell";

interface BrandWordmarkButtonProps {
  onClick: () => void;
  surfaceMode?: ChromeSurfaceMode;
  tooltipLabel?: string;
}

export function BrandWordmarkButton({
  onClick,
  surfaceMode = "pill",
  tooltipLabel = "About SoleMD",
}: BrandWordmarkButtonProps) {
  return (
    <Tooltip label={tooltipLabel} position="right" withArrow>
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-full border-0 px-4 py-1.5 transition-[background-color,box-shadow,filter] duration-300 hover:brightness-110"
        style={{
          ...(surfaceMode === "pill" ? promptSurfaceStyle : chromeFlushSurfaceStyle),
          color: "var(--graph-icon-color)",
        }}
        onClick={onClick}
        aria-label={tooltipLabel}
      >
        <span className="text-[1.45rem] font-semibold select-none">SoleMD</span>
      </button>
    </Tooltip>
  );
}
