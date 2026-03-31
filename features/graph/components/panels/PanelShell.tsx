"use client";

import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { Text, ActionIcon, Tooltip, Switch } from "@mantine/core";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { panelReveal } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";

const panelChromeTextClassName = "uppercase tracking-[0.08em]";

/**
 * Panel text style objects — inline styles beat Mantine's class-based font-size.
 * Each combines color + sizing so every `<Text style={…}>` is self-contained.
 */
export const panelTextStyle = { color: "var(--graph-panel-text)", fontSize: 10, lineHeight: "14px" } as const;
export const panelTextMutedStyle = { color: "var(--graph-panel-text-muted)", fontSize: 10, lineHeight: "14px" } as const;
export const panelTextDimStyle = { color: "var(--graph-panel-text-dim)", fontSize: 10, lineHeight: "14px" } as const;

/** Chrome label (panel title, section headings) — smallest tier. */
export const panelChromeStyle: React.CSSProperties = { fontSize: 9, lineHeight: "12px" };

/** Stat value text — slightly bolder than body. */
export const panelStatValueStyle: React.CSSProperties = { fontSize: 11, lineHeight: "14px" };

export const panelCardClassName = "rounded-lg px-2 py-1.5";
export const panelCardStyle: React.CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: "1px solid var(--graph-panel-border)",
};

/** Mode-accent tinted card — detail panels, preview blocks, citation items. */
export const panelAccentCardClassName = "rounded-xl px-3 py-3";
export const panelAccentCardStyle: React.CSSProperties = {
  backgroundColor: "var(--mode-accent-subtle)",
  border: "1px solid var(--mode-accent-border)",
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
  root: { color: "var(--graph-control-icon-color, var(--graph-panel-text-dim))" },
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
    backgroundColor: "color-mix(in srgb, var(--graph-panel-input-bg) 92%, white 8%)",
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text)",
  },
} as const;

/** Color tokens for active interactive pills (mode-accent tint). */
export const pillActiveColors = {
  backgroundColor: "var(--mode-accent-subtle)",
  color: "var(--mode-accent)",
  border: "1px solid var(--mode-accent-border)",
} as const;

/** Color tokens for inactive interactive pills (dim/neutral). */
export const pillInactiveColors = {
  backgroundColor: "var(--graph-panel-input-bg)",
  color: "var(--graph-panel-text-dim)",
  border: "1px solid var(--graph-panel-border)",
} as const;

/** Base layout for raw-span interactive pills (not Mantine Badge). */
const interactivePillBase: React.CSSProperties = {
  fontSize: 8,
  lineHeight: 1,
  padding: "1px 3px",
  borderRadius: 3,
  cursor: "pointer",
  userSelect: "none",
  transition: "all 80ms ease-out",
};

/**
 * Compact inline pill — sits next to section titles.
 * 14px tall, 8px text, mode-accent tint. Use instead of badgeOutlineStyles
 * for metadata counts ("8 shown", "top 6", "20 bins") inside panel sections.
 */
export const panelPillStyles = {
  root: {
    backgroundColor: "var(--mode-accent-subtle)",
    color: "var(--graph-panel-text)",
    border: "1px solid var(--mode-accent-border)",
    height: 14,
    minHeight: 14,
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 8,
    lineHeight: 1,
  },
  label: { lineHeight: 1 },
} as const;

/** Dimmer pill for type labels (categorical, numeric) — less prominent than stat pills. */
export const panelTypePillStyles = {
  root: {
    backgroundColor: "var(--graph-panel-input-bg)",
    color: "var(--graph-panel-text-dim)",
    border: "1px solid var(--graph-panel-border)",
    height: 14,
    minHeight: 14,
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 8,
    lineHeight: 1,
  },
  label: { lineHeight: 1 },
} as const;

/** Thin section divider — renders between groups inside panel bodies. */
export function PanelDivider() {
  return (
    <div
      className="mx-auto w-[calc(100%-8px)]"
      style={{ height: 1, backgroundColor: "var(--graph-panel-border)", opacity: 0.5 }}
    />
  );
}

interface PanelShellProps {
  children: ReactNode;
  title: string;
  side: "left" | "right";
  width?: number;
  headerActions?: ReactNode;
  onClose: () => void;
}

/** Centralized body padding class — replaces ad-hoc px/pb in each panel body div. */
export const PANEL_BODY_CLASS = "flex-1 overflow-y-auto px-2.5 pb-2.5";

/** Top offset so panels float below the Wordmark + panel icon row + stats/layer bar. */
export const PANEL_TOP = 116;

/** Mode-aware accent for Mantine `color` props inside panels. */
export const PANEL_ACCENT = "var(--mode-accent)";

/** Shared label color for Mantine Switch components inside panels. */
export const switchLabelStyle = { label: { color: "var(--graph-panel-text)" } };

/** Compact switch styles — 24×12 track, 10px label matching panelTextStyle. */
export const panelSwitchStyles = {
  label: {
    color: "var(--graph-panel-text)",
    fontSize: 10,
    lineHeight: "14px",
    paddingLeft: 6,
  },
  track: {
    minWidth: 24,
    height: 12,
    borderColor: "var(--graph-panel-border)",
  },
  thumb: {
    width: 10,
    height: 10,
    borderColor: "var(--graph-panel-border)",
  },
} as const;

/**
 * Panel switch with a visual gate — dims the track when checked but the gate
 * condition is inactive (e.g. zoom level too low).  The toggle still works
 * at any time; the dimming just signals "preference saved, not yet active."
 *
 * Pass `override` + `onOverrideChange` to show an inline "Always" toggle
 * that bypasses the gate.  Pre-wired with panelSwitchStyles / xs / accent.
 */
export function GatedSwitch({
  gateActive,
  checked,
  label,
  override,
  onOverrideChange,
  onChange,
  ...rest
}: Omit<ComponentProps<typeof Switch>, "size" | "styles"> & {
  gateActive: boolean;
  override?: boolean;
  onOverrideChange?: (on: boolean) => void;
}) {
  // Mantine wraps the entire Switch (input + label) in a <label htmlFor>,
  // so clicking the "Always" pill triggers native label→input forwarding
  // regardless of stopPropagation/preventDefault on the inner span.
  // Guard onChange with a ref to swallow the spurious toggle.
  const suppressChange = useRef(false);
  const suppressed = !!checked && !gateActive && !override;
  return (
    <Switch
      size="xs"
      color={PANEL_ACCENT}
      checked={checked}
      onChange={(e) => {
        if (suppressChange.current) {
          suppressChange.current = false;
          return;
        }
        onChange?.(e);
      }}
      label={
        onOverrideChange ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {label}
            {checked && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  suppressChange.current = true;
                  onOverrideChange(!override);
                  // Clear if label forwarding didn't fire (preventDefault worked)
                  queueMicrotask(() => { suppressChange.current = false; });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    suppressChange.current = true;
                    onOverrideChange(!override);
                    queueMicrotask(() => { suppressChange.current = false; });
                  }
                }}
                style={{
                  ...interactivePillBase,
                  ...(override ? pillActiveColors : pillInactiveColors),
                }}
              >
                Always
              </span>
            )}
          </span>
        ) : label
      }
      styles={{
        ...panelSwitchStyles,
        track: {
          ...panelSwitchStyles.track,
          opacity: suppressed ? 0.45 : undefined,
        },
      }}
      {...rest}
    />
  );
}

export function PanelShell({
  children,
  title,
  side,
  width = 300,
  headerActions,
  onClose,
}: PanelShellProps) {
  const reveal = panelReveal[side];
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

    let raf = 0;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPanelBottomY(side, PANEL_TOP + el.offsetHeight);
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      setPanelBottomY(side, 0);
    };
  }, [side, setPanelBottomY]);

  return (
    <motion.div
      ref={panelRef}
      initial={reveal.initial}
      animate={reveal.animate}
      exit={reveal.exit}
      transition={reveal.transition}
      className="absolute z-30 flex flex-col overflow-hidden rounded-xl"
      style={{
        ...reveal.style,
        top: PANEL_TOP,
        ...(side === "left" ? { left: 12 } : { right: 12 }),
        width,
        maxHeight: `calc(100vh - ${PANEL_TOP + 100}px)`,
        backgroundColor: "var(--graph-panel-bg)",
        border: "1px solid var(--graph-panel-border)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <Text
          fw={600}
          className={panelChromeTextClassName}
          style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
        >
          {title}
        </Text>
        <div className="flex items-center gap-1">
          {headerActions}
          <Tooltip
            label={`Close ${title.toLowerCase()}`}
            position="bottom"
            withArrow
          >
            <ActionIcon
              variant="transparent"
              size={24}
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()} panel`}
            >
              <X size={12} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

/** Shared label style for section headings inside panels. */
export const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  lineHeight: "12px",
  color: "var(--graph-panel-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

/** Shared style for table column headers inside panels. */
export const panelTableHeaderStyle: React.CSSProperties = {
  fontSize: "0.55rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--graph-panel-text-muted)",
};

/** Shared styles for Select/input components inside panels — compact & minimal. */
export const panelSelectStyles = {
  input: {
    backgroundColor: "var(--graph-panel-input-bg)",
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text)",
    minHeight: 22,
    height: 22,
    fontSize: 10,
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 20,
  },
  label: {
    color: "var(--graph-panel-text-muted)",
    fontSize: 9,
    lineHeight: "12px",
  },
  option: {
    fontSize: 10,
    padding: "3px 6px",
    borderRadius: 5,
  },
  dropdown: {
    borderRadius: 8,
    padding: 3,
  },
};
