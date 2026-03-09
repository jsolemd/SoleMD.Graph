"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Text, ActionIcon, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/** Shared spring config for consistent panel animations. */
export const PANEL_SPRING = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export const panelChromeTextClassName = "text-[11px] uppercase tracking-[0.08em]";
export const panelMetaTextClassName = "text-xs leading-4";
export const panelBodyTextClassName = "text-xs leading-5";
export const panelTitleTextClassName = "text-base leading-6";
export const panelStatValueTextClassName = "text-sm leading-5";

/** Reusable style objects for panel text colors — eliminates inline object allocation. */
export const panelTextStyle = { color: "var(--graph-panel-text)" } as const;
export const panelTextMutedStyle = { color: "var(--graph-panel-text-muted)" } as const;
export const panelTextDimStyle = { color: "var(--graph-panel-text-dim)" } as const;

export const panelCardClassName = "rounded-2xl px-3 py-3";
export const panelCardStyle: React.CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: "1px solid var(--graph-panel-border)",
};

export const panelErrorStyle: React.CSSProperties = {
  backgroundColor: "var(--error-bg)",
  border: "1px solid var(--error-border)",
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

  // Dismiss on Escape — ref avoids re-registering on every onClose identity change
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Right-side panels need z-50 to sit above native Cosmograph controls (z-40)
  const zClass = side === "right" ? "z-50" : "z-20";

  return (
    <motion.div
      initial={anim.initial}
      animate={{ opacity: 1, x: 0 }}
      exit={anim.exit}
      transition={PANEL_SPRING}
      className={`absolute top-0 ${side}-0 ${zClass} flex h-full flex-col overflow-hidden`}
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
          fw={600}
          className={panelChromeTextClassName}
          style={panelTextMutedStyle}
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

/** Shared style for table column headers inside panels. */
export const panelTableHeaderStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--graph-panel-text-muted)",
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
