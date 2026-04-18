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
import { useGraphModeController } from "@/features/graph/hooks/use-graph-mode-controller";
import { MODE_ORDER, getModeConfig } from "@/features/graph/lib/modes";
import { bouncy } from "@/lib/motion";
import type { GraphMode } from "@/features/graph/config";
import { useShellVariantContext } from "../shell/ShellVariantContext";

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
}: {
  compact?: boolean;
}) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const { mode, applyMode, stepPromptDown } = useGraphModeController();
  const lastActiveClickRef = useRef<number>(0);

  const handleClick = useCallback(
    (key: GraphMode) => {
      if (key === mode) {
        const now = Date.now();
        if (now - lastActiveClickRef.current < 400) {
          stepPromptDown();
          lastActiveClickRef.current = 0;
          return;
        }
        lastActiveClickRef.current = now;
        return;
      }
      lastActiveClickRef.current = 0;
      applyMode(key);
    },
    [applyMode, mode, stepPromptDown],
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
            <Tooltip label={config.label} position="top" withArrow disabled={isMobile}>
              <motion.button
                onClick={() => handleClick(key)}
                className={`relative flex items-center gap-1 rounded-full font-medium ${
                  isMobile ? "h-10 px-3 text-sm" : "h-7 px-2 py-1 text-xs"
                }`}
                style={{
                  backgroundColor: isActive
                    ? "var(--mode-accent-subtle)"
                    : "transparent",
                  borderColor: "transparent",
                  color: "var(--graph-prompt-inactive)",
                  border: "none",
                  cursor: "pointer",
                }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={bouncy}
                aria-pressed={isActive}
                aria-label={`${config.label} mode`}
              >
                <div
                  className={`flex flex-shrink-0 items-center justify-center ${
                    isMobile ? "h-5 w-5" : "h-4 w-4"
                  }`}
                >
                  <Icon size={isMobile ? 18 : 14} />
                </div>
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
