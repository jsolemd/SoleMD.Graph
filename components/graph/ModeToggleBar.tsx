"use client";

import { Fragment, useCallback, useRef } from "react";
import { Tooltip } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Compass,
  BookOpen,
  PenLine,
} from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { MODE_ORDER, getModeConfig } from "@/lib/graph/modes";
import { bouncy, settle, dblHoverHint } from "@/lib/motion";
import type { GraphMode } from "@/lib/graph/types";

/** Inactive mode icon hover — wiggle to hint "click me". */
const INACTIVE_ICON_HOVER = {
  rotate: [0, -12, 12, -8, 8, 0],
  scale: 1.1,
  transition: { rotate: { duration: 0.5, ease: "easeInOut" as const }, scale: bouncy },
};

/** Icon mapping — keeps presentation separate from mode data. */
const MODE_ICONS: Record<GraphMode, typeof MessageCircle> = {
  ask: MessageCircle,
  explore: Compass,
  learn: BookOpen,
  create: PenLine,
};

/** Gradient divider between mode toggles. */
function ModeDivider() {
  return (
    <div
      className="h-5 w-px mx-1 flex-shrink-0 rounded-full"
      style={{
        background:
          "linear-gradient(to bottom, transparent, var(--graph-prompt-divider), transparent)",
      }}
    />
  );
}

/** Shared mode toggle bar. */
export function ModeToggleBar({
  compact = false,
  onModeChange,
}: {
  compact?: boolean;
  onModeChange?: (mode: GraphMode) => void;
}) {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const togglePromptMinimized = useDashboardStore((s) => s.togglePromptMinimized);
  const lastActiveClickRef = useRef<number>(0);

  const handleClick = useCallback(
    (key: GraphMode) => {
      if (key === mode) {
        const now = Date.now();
        if (now - lastActiveClickRef.current < 400) {
          togglePromptMinimized();
          lastActiveClickRef.current = 0;
          return;
        }
        lastActiveClickRef.current = now;
        return;
      }
      lastActiveClickRef.current = 0;
      setMode(key);
      onModeChange?.(key);
    },
    [mode, setMode, onModeChange, togglePromptMinimized],
  );

  return (
    <div className="flex items-center">
      {MODE_ORDER.map((key, i) => {
        const config = getModeConfig(key);
        const isActive = key === mode;
        const Icon = MODE_ICONS[key];
        return (
          <Fragment key={key}>
            {i > 0 && <ModeDivider />}
            <Tooltip label={config.label} position="top" withArrow>
              <motion.button
                onClick={() => handleClick(key)}
                className="relative flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors duration-200 border h-7"
                style={{
                  backgroundColor: isActive
                    ? "var(--mode-accent-subtle)"
                    : "transparent",
                  borderColor: "transparent",
                  color: isActive
                    ? "var(--mode-accent)"
                    : "var(--graph-prompt-inactive)",
                }}
                whileHover={isActive ? dblHoverHint : undefined}
                aria-pressed={isActive}
                aria-label={`${config.label} mode`}
              >
                <motion.div
                  className="flex items-center justify-center w-4 h-4 flex-shrink-0"
                  animate={{
                    rotate: isActive ? 360 : 0,
                    scale: isActive ? 1.1 : 1,
                  }}
                  whileHover={isActive ? undefined : INACTIVE_ICON_HOVER}
                  transition={settle}
                >
                  <Icon size={14} />
                </motion.div>
                {!compact && (
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <motion.span
                        key={key}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {config.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                )}
              </motion.button>
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}
