"use client";

import { Tooltip } from "@mantine/core";
import { promptSurfaceStyle } from "../panels/PanelShell";

interface BrandWordmarkButtonProps {
  accentColor: string;
  onClick: () => void;
  tooltipLabel?: string;
}

export function BrandWordmarkButton({
  accentColor,
  onClick,
  tooltipLabel = "About SoleMD",
}: BrandWordmarkButtonProps) {
  return (
    <Tooltip label={tooltipLabel} position="right" withArrow>
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-full border-0 px-4 py-1.5 transition-[filter] hover:brightness-110"
        style={promptSurfaceStyle}
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
