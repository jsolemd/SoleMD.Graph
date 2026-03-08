"use client";

import type { ReactNode } from "react";
import { Text, ActionIcon, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/** Shared spring config for consistent panel animations. */
export const PANEL_SPRING = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

interface PanelShellProps {
  children: ReactNode;
  title: string;
  side: "left" | "right";
  width?: number;
  onClose: () => void;
}

const ANIMATION = {
  left: { initial: { opacity: 0, x: -20 }, exit: { opacity: 0, x: -20 } },
  right: { initial: { opacity: 0, x: 20 }, exit: { opacity: 0, x: 20 } },
};

export function PanelShell({
  children,
  title,
  side,
  width = 300,
  onClose,
}: PanelShellProps) {
  const anim = ANIMATION[side];

  return (
    <motion.div
      initial={anim.initial}
      animate={{ opacity: 1, x: 0 }}
      exit={anim.exit}
      transition={PANEL_SPRING}
      className={`absolute top-0 ${side}-0 z-20 flex h-full flex-col overflow-hidden`}
      style={{
        width,
        backgroundColor: "var(--graph-panel-bg)",
        borderRight:
          side === "left"
            ? "1px solid var(--graph-panel-border)"
            : undefined,
        borderLeft:
          side === "right"
            ? "1px solid var(--graph-panel-border)"
            : undefined,
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Text
          size="xs"
          fw={600}
          className="uppercase tracking-wider"
          style={{ color: "var(--graph-panel-text-muted)" }}
        >
          {title}
        </Text>
        <Tooltip
          label={`Close ${title.toLowerCase()}`}
          position="bottom"
          withArrow
        >
          <ActionIcon
            variant="subtle"
            size={28}
            radius="xl"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()} panel`}
            styles={{ root: { color: "var(--graph-panel-text-dim)" } }}
          >
            <X size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
      {children}
    </motion.div>
  );
}

/** Shared label style for section headings inside panels. */
export const sectionLabelStyle: React.CSSProperties = {
  color: "var(--graph-panel-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

/** Shared styles for Select/input components inside panels. */
export const panelSelectStyles = {
  input: {
    backgroundColor: "var(--graph-panel-input-bg)",
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text)",
  },
  label: {
    color: "var(--graph-panel-text-muted)",
  },
};
