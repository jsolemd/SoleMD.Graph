"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Text, ActionIcon, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { smooth } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";

const panelChromeTextClassName = "uppercase tracking-[0.08em]";

/**
 * Panel text style objects — inline styles beat Mantine's class-based font-size.
 * Each combines color + sizing so every `<Text style={…}>` is self-contained.
 */
export const panelTextStyle = { color: "var(--graph-panel-text)", fontSize: 11, lineHeight: "16px" } as const;
export const panelTextMutedStyle = { color: "var(--graph-panel-text-muted)", fontSize: 11, lineHeight: "16px" } as const;
export const panelTextDimStyle = { color: "var(--graph-panel-text-dim)", fontSize: 11, lineHeight: "16px" } as const;

/** Chrome label (panel title, section headings) — smallest tier. */
export const panelChromeStyle: React.CSSProperties = { fontSize: 10, lineHeight: "14px" };

/** Stat value text — slightly bolder than body. */
export const panelStatValueStyle: React.CSSProperties = { fontSize: 12, lineHeight: "16px" };

export const panelCardClassName = "rounded-xl px-2.5 py-2";
export const panelCardStyle: React.CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: "1px solid var(--graph-panel-border)",
};

export const panelErrorStyle: React.CSSProperties = {
  backgroundColor: "var(--error-bg)",
  border: "1px solid var(--error-border)",
};

/**
 * Shared Mantine `styles` for all graph icon buttons.
 * Sets `color` as an inline style so it beats Mantine's internal
 * `color: var(--ai-color)` from the variant system.
 * Hover/active backgrounds are handled by the `.graph-icon-btn` CSS class.
 */
export const iconBtnStyles = {
  root: { color: "var(--graph-panel-text-dim)" },
} as const;

/** Badge with mode-accent background — for cluster labels, "Primary" tags. */
export const badgeAccentStyles = {
  root: {
    backgroundColor: "var(--mode-accent-subtle)",
    color: "var(--graph-panel-text)",
    border: "1px solid var(--mode-accent-border)",
  },
} as const;

/** Badge with outline — for section, page number, neutral metadata. */
export const badgeOutlineStyles = {
  root: {
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text-dim)",
  },
} as const;

interface PanelShellProps {
  children: ReactNode;
  title: string;
  side: "left" | "right";
  width?: number;
  onClose: () => void;
}

/** Top offset so panels float below the Wordmark + panel icon row + stats/layer bar. */
export const PANEL_TOP = 116;

/** Mode-aware accent for Mantine `color` props inside panels. */
export const PANEL_ACCENT = "var(--mode-accent)";

/** Shared label color for Mantine Switch components inside panels. */
export const switchLabelStyle = { label: { color: "var(--graph-panel-text)" } };

const PANEL_ANIMATION = { initial: { opacity: 0, y: -16 }, exit: { opacity: 0, y: -16 } };

export function PanelShell({
  children,
  title,
  side,
  width = 300,
  onClose,
}: PanelShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const setPanelBottomY = useDashboardStore((s) => s.setPanelBottomY);

  // Dismiss on Escape — ref avoids re-registering on every onClose identity change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Report panel bottom position so PromptBox can check for overlap.
  // Use layout position (PANEL_TOP + height) instead of getBoundingClientRect,
  // which reflects the current framer-motion animated transform (y: -16 on enter).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const report = () => {
      setPanelBottomY(side, PANEL_TOP + el.offsetHeight);
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setPanelBottomY(side, 0);
    };
  }, [side, setPanelBottomY]);

  return (
    <motion.div
      ref={panelRef}
      initial={PANEL_ANIMATION.initial}
      animate={{ opacity: 1, y: 0 }}
      exit={PANEL_ANIMATION.exit}
      transition={smooth}
      className="absolute z-30 flex flex-col overflow-hidden rounded-2xl"
      style={{
        top: PANEL_TOP,
        ...(side === "left" ? { left: 12 } : { right: 12 }),
        width,
        maxHeight: `calc(100vh - ${PANEL_TOP + 100}px)`,
        backgroundColor: "var(--graph-panel-bg)",
        border: "1px solid var(--graph-panel-border)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <Text
          fw={600}
          className={panelChromeTextClassName}
          style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
        >
          {title}
        </Text>
        <Tooltip
          label={`Close ${title.toLowerCase()}`}
          position="bottom"
          withArrow
        >
          <ActionIcon
            variant="transparent"
            size={28}
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()} panel`}
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
  fontSize: 10,
  lineHeight: "14px",
  color: "var(--graph-panel-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

/** Shared style for table column headers inside panels. */
export const panelTableHeaderStyle: React.CSSProperties = {
  fontSize: "0.6rem",
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
