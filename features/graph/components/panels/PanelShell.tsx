"use client";

import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { Loader, Text, Switch } from "@mantine/core";
import { motion } from "framer-motion";
import { panelReveal } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";
import { selectPanelLeftOffset } from "@/features/graph/stores/dashboard-store";
import { PanelChrome } from "./PanelChrome";
import { useFloatingPanel } from "./use-floating-panel";

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

/** Panel surface triple — bg + border + shadow from CSS tokens. */
export const panelSurfaceStyle: React.CSSProperties = {
  backgroundColor: "var(--graph-panel-bg)",
  border: "1px solid var(--graph-panel-border)",
  boxShadow: "var(--graph-panel-shadow)",
};

/** Prompt/overlay surface triple — uses prompt-specific tokens. */
export const promptSurfaceStyle: React.CSSProperties = {
  backgroundColor: "var(--graph-prompt-bg)",
  border: "1px solid var(--graph-prompt-border)",
  boxShadow: "var(--graph-prompt-shadow)",
};

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

/** Base layout for raw-span interactive pills (not Mantine Badge).
 *  `position: relative` + `zIndex: 1` lifts the pill above Mantine Switch's
 *  invisible full-width `<input>` overlay so clicks hit the pill first. */
const interactivePillBase: React.CSSProperties = {
  fontSize: 8,
  lineHeight: 1,
  padding: "1px 3px",
  borderRadius: 3,
  cursor: "pointer",
  userSelect: "none",
  transition: "all 80ms ease-out",
  position: "relative",
  zIndex: 1,
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

/**
 * Shared inline loading indicator — mode-accent spinner with optional dim label.
 * Single source of truth for every circular loader in the app; tint follows
 * the active mode via `--mode-accent`.
 */
export function PanelInlineLoader({
  label,
  size = 10,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Loader size={size} color="var(--mode-accent)" />
      {label && <Text component="span" style={panelTextDimStyle}>{label}</Text>}
    </span>
  );
}

interface PanelShellProps {
  children: ReactNode;
  /** Panel identifier — used for auto-stacking offset and floating obstacle tracking. */
  id: string;
  title: string;
  side?: "left" | "right";
  /** Default docked width (overridden by resize). */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  headerActions?: ReactNode;
  onClose: () => void;
}

/** Centralized body padding class — replaces ad-hoc px/pb in each panel body div. */
export const PANEL_BODY_CLASS = "flex-1 overflow-y-auto px-2.5 pb-2.5";

/** Top offset so panels float below the Wordmark + panel icon row. */
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
  id,
  title,
  side = "left",
  defaultWidth = 300,
  minWidth,
  maxWidth,
  defaultHeight,
  minHeight,
  maxHeight,
  headerActions,
  onClose,
}: PanelShellProps) {
  const {
    panelRef,
    dragControls,
    dragX,
    dragY,
    width,
    height,
    isDocked,
    onTitlePointerDown,
    onTitleDoubleClick,
    onDragEnd,
    onResizeMouseDown,
    onResizeVerticalMouseDown,
    onResizeCornerMouseDown,
  } = useFloatingPanel({
    id,
    side,
    defaultWidth,
    minWidth,
    maxWidth,
    defaultHeight,
    minHeight,
    maxHeight,
  });

  // Auto-stacking offset from panels docked before this one
  const leftOffset = useDashboardStore((s) => selectPanelLeftOffset(s, id));

  // Report panelBottomY when docked so the prompt position system knows the panel's height.
  const setPanelBottomY = useDashboardStore((s) => s.setPanelBottomY);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !isDocked) {
      setPanelBottomY(side, 0);
      return;
    }

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
  }, [side, setPanelBottomY, isDocked, panelRef]);

  const reveal = panelReveal[side];

  return (
    <motion.div
      ref={panelRef}
      initial={reveal.initial}
      animate={reveal.animate}
      exit={reveal.exit}
      transition={reveal.transition}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={onDragEnd}
      style={{
        ...reveal.style,
        x: dragX,
        y: dragY,
        top: PANEL_TOP,
        ...(side === "left" ? { left: 12 + leftOffset } : { right: 12 }),
        width,
        height: height ?? undefined,
        maxHeight: height ? undefined : `calc(100vh - ${PANEL_TOP + 100}px)`,
        ...panelSurfaceStyle,
      }}
      className="absolute z-30 flex flex-col overflow-hidden rounded-xl"
    >
      <PanelChrome
        title={title}
        headerActions={headerActions}
        onClose={onClose}
        onTitlePointerDown={onTitlePointerDown}
        onTitleDoubleClick={onTitleDoubleClick}
      >
        {children}
      </PanelChrome>

      {/* Horizontal resize handle */}
      <div
        className="absolute top-0 h-full w-2 cursor-col-resize"
        style={{ [side === "left" ? "right" : "left"]: 0 }}
        onMouseDown={onResizeMouseDown}
      />
      {/* Vertical resize handle */}
      <div
        className="absolute bottom-0 left-0 h-2 w-full cursor-row-resize"
        onMouseDown={onResizeVerticalMouseDown}
      />
      {/* Corner resize handle */}
      <div
        className="absolute bottom-0 z-10 h-4 w-4 cursor-nwse-resize"
        style={{ [side === "left" ? "right" : "left"]: 0 }}
        onMouseDown={onResizeCornerMouseDown}
      />
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
