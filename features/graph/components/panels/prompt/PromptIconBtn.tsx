"use client";

import { Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { bouncy } from "@/lib/motion";

export interface PromptIconBtnProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  size?: "sm" | "md";
  active?: boolean;
  disabled?: boolean;
  "aria-pressed"?: boolean;
}

export function PromptIconBtn({
  icon: Icon,
  label,
  onClick,
  size = "sm",
  active,
  disabled,
  "aria-pressed": ariaPressed,
}: PromptIconBtnProps) {
  const md = size === "md";
  return (
    <Tooltip label={label} position="top" withArrow>
      <motion.button
        whileHover={{ scale: md ? 1.08 : 1.12 }}
        whileTap={{ scale: md ? 0.92 : 0.9 }}
        transition={bouncy}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center rounded-full flex-shrink-0 ${md ? "h-9 w-9" : "h-7 w-7"}`}
        style={{
          backgroundColor: active ? "var(--mode-accent-subtle)" : "transparent",
          color: active ? "var(--mode-accent)" : "var(--graph-prompt-inactive)",
          border: "none",
        }}
        aria-label={label}
        aria-pressed={ariaPressed}
      >
        <Icon size={md ? 18 : 15} />
      </motion.button>
    </Tooltip>
  );
}
