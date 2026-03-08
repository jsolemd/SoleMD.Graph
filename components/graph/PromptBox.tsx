"use client";

import { Fragment, useCallback, useRef } from "react";
import { Textarea, Tooltip } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Compass,
  BookOpen,
  PenLine,
  ArrowUp,
} from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/lib/graph/stores";
import { MODE_ORDER, getModeConfig } from "@/lib/graph/modes";
import type { GraphMode } from "@/lib/graph/types";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };

/** Icon mapping — keeps presentation separate from mode data. */
const MODE_ICONS: Record<GraphMode, typeof MessageCircle> = {
  ask: MessageCircle,
  explore: Compass,
  learn: BookOpen,
  write: PenLine,
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
  onModeChange,
}: {
  onModeChange?: (mode: GraphMode) => void;
}) {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);

  const handleClick = useCallback(
    (key: GraphMode) => {
      setMode(key);
      onModeChange?.(key);
    },
    [setMode, onModeChange],
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
              <button
                onClick={() => handleClick(key)}
                className="relative flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-all duration-200 border h-7"
                style={{
                  backgroundColor: isActive
                    ? `${config.color}15`
                    : "transparent",
                  borderColor: isActive ? config.color : "transparent",
                  color: isActive
                    ? config.color
                    : "var(--graph-prompt-inactive)",
                }}
                aria-pressed={isActive}
                aria-label={`${config.label} mode`}
              >
                <motion.div
                  className="flex items-center justify-center w-4 h-4 flex-shrink-0"
                  animate={{
                    rotate: isActive ? 360 : 0,
                    scale: isActive ? 1.1 : 1,
                  }}
                  whileHover={{
                    rotate: isActive ? 360 : 15,
                    scale: 1.1,
                    transition: {
                      type: "spring",
                      stiffness: 300,
                      damping: 10,
                    },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 25,
                  }}
                >
                  <Icon size={14} />
                </motion.div>
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
              </button>
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}

export function PromptBox() {
  const mode = useGraphStore((s) => s.mode);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const writeContent = useDashboardStore((s) => s.writeContent);
  const setWriteContent = useDashboardStore((s) => s.setWriteContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeMode = getModeConfig(mode);
  const { layout } = activeMode;
  const isWrite = mode === "write";

  const handleModeChange = useCallback(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // Shift up above timeline / data table when visible
  let bottomOffset = 32;
  if (layout.showTimeline && showTimeline) bottomOffset += 36;
  if (layout.showDataTable && tableOpen) bottomOffset += tableHeight;
  if (bottomOffset > 32) bottomOffset += 8;

  return (
    <motion.div
      layout="position"
      transition={SPRING}
      className="fixed z-50 left-1/2 -translate-x-1/2 w-[min(640px,90vw)]"
      style={
        isWrite
          ? { top: 48, bottom: 48 }
          : { bottom: bottomOffset }
      }
    >
      <motion.div
        layout
        transition={SPRING}
        className="rounded-3xl p-3 flex flex-col"
        style={{
          backgroundColor: "var(--graph-prompt-bg)",
          border: "1px solid var(--graph-prompt-border)",
          boxShadow: "var(--graph-prompt-shadow)",
          height: isWrite ? "100%" : "auto",
        }}
      >
        {/* Textarea — same component, just more room in write mode */}
        <Textarea
          ref={textareaRef}
          placeholder={activeMode.placeholder}
          value={isWrite ? writeContent : undefined}
          onChange={
            isWrite ? (e) => setWriteContent(e.currentTarget.value) : undefined
          }
          autosize={!isWrite}
          minRows={isWrite ? undefined : 1}
          maxRows={isWrite ? undefined : 4}
          styles={{
            root: { width: "100%", flex: isWrite ? 1 : undefined },
            wrapper: { height: isWrite ? "100%" : undefined },
            input: {
              backgroundColor: "transparent",
              border: "none",
              color: "var(--graph-prompt-text)",
              fontSize: "0.9375rem",
              padding: "0.25rem 0.5rem",
              lineHeight: 1.5,
              height: isWrite ? "100%" : undefined,
              resize: "none",
            },
          }}
          aria-label={`${activeMode.label} prompt`}
        />

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-2">
          <ModeToggleBar onModeChange={handleModeChange} />

          {/* Submit */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
            style={{
              backgroundColor: activeMode.color,
              color: "#1a1b1e",
            }}
            aria-label="Submit prompt"
          >
            <ArrowUp size={16} />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
