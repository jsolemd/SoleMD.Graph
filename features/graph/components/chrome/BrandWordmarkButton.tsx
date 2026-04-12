"use client";

import { Tooltip } from "@mantine/core";
import { BrainCircuit } from "lucide-react";

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
        className="graph-icon-btn flex cursor-pointer items-center gap-2 rounded-2xl border-0 px-3 py-1.5 transition-[background-color,box-shadow,opacity] hover:opacity-80"
        style={{
          backgroundColor: "var(--graph-control-idle-bg, transparent)",
          boxShadow:
            "inset 0 0 0 1px var(--graph-control-idle-border, transparent)",
        }}
        onClick={onClick}
        aria-label={tooltipLabel}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300"
          style={{ backgroundColor: accentColor }}
        >
          <BrainCircuit size={15} color="white" />
        </div>
        <span
          className="text-lg font-semibold select-none"
          style={{ color: "var(--graph-wordmark-text)" }}
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
