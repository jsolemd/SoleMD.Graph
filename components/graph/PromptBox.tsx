"use client";

import { useCallback, useRef } from "react";
import { ActionIcon, Textarea, Tooltip } from "@mantine/core";
import { useComputedColorScheme } from "@mantine/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Compass,
  BookOpen,
  PenLine,
  ArrowUp,
} from "lucide-react";
import { useGraphStore } from "@/lib/graph/store";
import type { GraphMode } from "@/lib/graph/types";

const MODES: { key: GraphMode; label: string; icon: typeof MessageCircle; color: string }[] = [
  { key: "ask", label: "Ask", icon: MessageCircle, color: "#a8c5e9" },
  { key: "explore", label: "Explore", icon: Compass, color: "#fbb44e" },
  { key: "learn", label: "Learn", icon: BookOpen, color: "#aedc93" },
  { key: "write", label: "Write", icon: PenLine, color: "#ffada4" },
];

export function PromptBox() {
  const mode = useGraphStore((s) => s.mode);
  const setMode = useGraphStore((s) => s.setMode);
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeMode = MODES.find((m) => m.key === mode)!;

  const handleModeClick = useCallback(
    (key: GraphMode) => {
      setMode(key);
      textareaRef.current?.focus();
    },
    [setMode]
  );

  return (
    <div className="fixed bottom-8 left-1/2 z-50 w-[min(640px,90vw)] -translate-x-1/2">
      <div
        className="rounded-3xl backdrop-blur-xl"
        style={{
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.04)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
          boxShadow: isDark
            ? "0 8px 32px rgba(0,0,0,0.4)"
            : "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Mode toggles */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-1">
          {MODES.map((m) => {
            const isActive = m.key === mode;
            const Icon = m.icon;
            return (
              <Tooltip key={m.key} label={m.label} position="top" withArrow>
                <button
                  onClick={() => handleModeClick(m.key)}
                  className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive
                      ? `${m.color}${isDark ? "30" : "20"}`
                      : "transparent",
                    color: isActive
                      ? m.color
                      : isDark
                        ? "rgba(255,255,255,0.4)"
                        : "rgba(0,0,0,0.35)",
                  }}
                  aria-pressed={isActive}
                  aria-label={`${m.label} mode`}
                >
                  <Icon size={14} />
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <motion.span
                        key={m.key}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {m.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Textarea + submit */}
        <div className="flex items-end gap-2 px-4 pb-3 pt-1">
          <Textarea
            ref={textareaRef}
            placeholder={`${activeMode.label} the knowledge graph...`}
            autosize
            minRows={1}
            maxRows={4}
            radius="xl"
            styles={{
              root: { flex: 1 },
              input: {
                backgroundColor: "transparent",
                border: "none",
                color: isDark ? "#fff" : "#1a1b1e",
                fontSize: "0.875rem",
                padding: "0.5rem 0",
                "&::placeholder": {
                  color: isDark
                    ? "rgba(255,255,255,0.3)"
                    : "rgba(0,0,0,0.3)",
                },
              },
            }}
            aria-label={`${activeMode.label} prompt`}
          />
          <ActionIcon
            size={36}
            radius="xl"
            variant="filled"
            aria-label="Submit prompt"
            styles={{
              root: {
                backgroundColor: activeMode.color,
                color: "#fff",
                flexShrink: 0,
                marginBottom: 2,
              },
            }}
          >
            <ArrowUp size={18} />
          </ActionIcon>
        </div>
      </div>
    </div>
  );
}
