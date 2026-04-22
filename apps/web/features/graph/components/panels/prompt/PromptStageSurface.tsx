"use client";

import { Search, SlidersHorizontal, Target } from "lucide-react";
import { ModeToggleBar } from "../../chrome/ModeToggleBar";
import {
  panelTextDimStyle,
  panelTextMutedStyle,
  promptSurfaceStyle,
} from "../PanelShell/panel-styles";
import { PromptIconBtn } from "./PromptIconBtn";

interface PromptStageSurfaceProps {
  className?: string;
  compact?: boolean;
  helperText?: string;
  onPrimaryAction?: () => void;
  placeholder?: string;
  primaryActionDisabled?: boolean;
}

export function PromptStageSurface({
  className,
  compact = false,
  helperText,
  onPrimaryAction,
  placeholder = "Ask the knowledge web about mechanisms, evidence, clusters, or papers…",
  primaryActionDisabled = false,
}: PromptStageSurfaceProps) {
  return (
    <div
      className={[
        "rounded-surface-lg",
        compact ? "p-2.5" : "p-3.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={promptSurfaceStyle}
    >
      <div
        className={[
          "rounded-[1.15rem] border border-transparent",
          compact ? "min-h-[48px] px-3 py-2.5" : "min-h-[92px] px-4 py-3.5",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-input-bg) 92%, var(--graph-prompt-bg) 8%) 0%, color-mix(in srgb, var(--graph-panel-input-bg) 86%, transparent) 100%)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--graph-panel-border) 36%, transparent)",
        }}
      >
        <p
          className={compact ? "text-[0.92rem] leading-6" : "text-[1rem] leading-7"}
          style={{
            ...panelTextMutedStyle,
            color: "var(--graph-prompt-placeholder)",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: compact ? 1 : 3,
            overflow: "hidden",
          }}
        >
          {placeholder}
        </p>
      </div>

      {helperText ? (
        <p
          className={compact ? "mt-1.5 text-[12px] leading-5" : "mt-2.5 text-[13px] leading-6"}
          style={panelTextDimStyle}
        >
          {helperText}
        </p>
      ) : null}

      <div
        className={[
          "flex items-center justify-between gap-3",
          compact ? "mt-2.5" : "mt-3",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="min-w-0">
          <ModeToggleBar compact={compact} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {!compact ? (
            <>
              <PromptIconBtn
                icon={SlidersHorizontal}
                label="Formatting"
                active
                onClick={() => {}}
              />
              <PromptIconBtn
                icon={Target}
                label="Selection scope"
                onClick={() => {}}
              />
            </>
          ) : null}
          <PromptIconBtn
            icon={Search}
            label="Open graph"
            onClick={() => onPrimaryAction?.()}
            size={compact ? "sm" : "md"}
            variant="primary"
            disabled={primaryActionDisabled}
          />
        </div>
      </div>
    </div>
  );
}
