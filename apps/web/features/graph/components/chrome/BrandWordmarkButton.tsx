"use client";

import type { CSSProperties } from "react";
import { Tooltip } from "@mantine/core";
import {
  promptSurfaceStyle,
  type ChromeSurfaceMode,
} from "../panels/PanelShell";

interface BrandWordmarkButtonProps {
  accentColor: string;
  onClick: () => void;
  surfaceMode?: ChromeSurfaceMode;
  tooltipLabel?: string;
}

const flushWordmarkStyle: CSSProperties = {
  backgroundColor: "transparent",
  border: "1px solid transparent",
  boxShadow: "none",
};

export function BrandWordmarkButton({
  accentColor,
  onClick,
  surfaceMode = "pill",
  tooltipLabel = "About SoleMD",
}: BrandWordmarkButtonProps) {
  return (
    <Tooltip label={tooltipLabel} position="right" withArrow>
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-full border-0 px-4 py-1.5 transition-[background-color,box-shadow,filter] duration-300 hover:brightness-110"
        style={surfaceMode === "pill" ? promptSurfaceStyle : flushWordmarkStyle}
        onClick={onClick}
        aria-label={tooltipLabel}
      >
        <span
          className="text-[1.45rem] font-semibold select-none"
          style={{ color: "var(--graph-icon-color)" }}
        >
          Sole
          <span
            className="transition-colors duration-300"
            style={{ color: accentColor }}
          >
            MD
          </span>
        </span>
      </button>
    </Tooltip>
  );
}
