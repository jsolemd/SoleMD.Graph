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
}: PromptIconBtnProps) {
  const md = size === "md";
  return (
    <Tooltip label={label} position="top" withArrow>
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={bouncy}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center rounded-full flex-shrink-0 ${md ? "h-9 w-9" : "h-7 w-7"}`}
        style={{
          backgroundColor: active ? "var(--mode-accent-subtle)" : "transparent",
          color: "var(--graph-prompt-inactive)",
          border: "none",
          cursor: disabled ? "default" : "pointer",
        }}
        aria-label={label}
        aria-pressed={active || undefined}
      >
        <Icon size={md ? 18 : 15} />
      </motion.button>
    </Tooltip>
  );
}
