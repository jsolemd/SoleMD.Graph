"use client";

import { Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { pressable } from "@/lib/motion";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";

/** Prompt-icon sizing in viewport px per size × platform.
 *  Prompt icons live inside the prompt box (its own chrome), tuned
 *  independently of the graph-chrome icon system. Mobile rows grow to
 *  comfortable touch targets; desktop rows compress for density. */
const PROMPT_ICON_SHELL_PX = {
  sm: { mobile: 40, desktop: 28 },
  md: { mobile: 44, desktop: 36 },
} as const;
const PROMPT_ICON_GLYPH_PX = {
  sm: { mobile: 18, desktop: 15 },
  md: { mobile: 20, desktop: 18 },
} as const;

type PromptIconVariant = "default" | "primary";
type PromptIconSize = keyof typeof PROMPT_ICON_SHELL_PX;

export interface PromptIconBtnProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  size?: PromptIconSize;
  /** Toggle on-state — renders accent tint and sets aria-pressed. */
  active?: boolean;
  /** `"primary"` reserves the accent tint for standout actions (e.g. submit). */
  variant?: PromptIconVariant;
  disabled?: boolean;
}

export function PromptIconBtn({
  icon: Icon,
  label,
  onClick,
  size = "sm",
  active = false,
  variant = "default",
  disabled = false,
}: PromptIconBtnProps) {
  const shellVariant = useShellVariantContext();
  const platform = shellVariant === "mobile" ? "mobile" : "desktop";
  const shellPx = PROMPT_ICON_SHELL_PX[size][platform];
  const glyphPx = PROMPT_ICON_GLYPH_PX[size][platform];
  const isPrimary = variant === "primary";

  /** Primary (submit) fills the circle with the mode-accent pastel and puts
   *  a white arrow glyph on top — the ChatGPT/Claude/Gemini send-button
   *  pattern: colored send circle + white inverse arrow. Non-primary toggles
   *  keep --graph-icon-color so they read the same as every other chrome icon. */
  const backgroundColor = isPrimary
    ? "var(--mode-accent)"
    : active
      ? "var(--mode-accent-subtle)"
      : "transparent";
  const iconColor = isPrimary ? "var(--on-accent)" : "var(--graph-icon-color)";

  return (
    <Tooltip label={label} position="top" withArrow disabled={platform === "mobile"}>
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        {...pressable(disabled)}
        className="flex flex-shrink-0 items-center justify-center rounded-full border-0"
        style={{
          width: shellPx,
          height: shellPx,
          backgroundColor,
          color: iconColor,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.35 : 1,
          boxShadow: isPrimary && !disabled
            ? "0 2px 8px color-mix(in srgb, var(--mode-accent) 40%, transparent)"
            : undefined,
        }}
        aria-label={label}
        aria-pressed={active || undefined}
      >
        <Icon size={glyphPx} strokeWidth={isPrimary ? 2.5 : undefined} />
      </motion.button>
    </Tooltip>
  );
}
