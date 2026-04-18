import type { CSSProperties } from "react";
import { densityCssPx, densityPx } from "@/lib/density";

export const PANEL_SCALE_CSS_VAR = "--graph-panel-scale";
export const PANEL_READING_SCALE_CSS_VAR = "--graph-panel-reading-scale";

export function panelScaledPx(value: number): string {
  return `calc(${value}px * var(${PANEL_READING_SCALE_CSS_VAR}, 1))`;
}

// Sets both --graph-panel-scale and --graph-panel-reading-scale on the panel
// element. Declaring --graph-panel-reading-scale here (not at :root) forces
// Chrome to compute the calc against this element's own --app-density and
// ${scale}, so per-panel scale changes actually flow through to descendants.
export function createPanelScaleStyle(scale: number): CSSProperties {
  return {
    [PANEL_SCALE_CSS_VAR]: String(scale),
    [PANEL_READING_SCALE_CSS_VAR]: `calc(var(--app-density) * ${scale})`,
  } as CSSProperties;
}

const densityBorder = (color: string) => `${densityCssPx(1)} solid ${color}`;

/**
 * Panel text style objects — inline styles beat Mantine's class-based font-size.
 * Each combines color + sizing so every `<Text style={…}>` is self-contained.
 */
export const panelTextStyle = {
  color: "var(--graph-panel-text)",
  fontSize: panelScaledPx(10),
  lineHeight: panelScaledPx(14),
} as const;

export const panelTextMutedStyle = {
  color: "var(--graph-panel-text-muted)",
  fontSize: panelScaledPx(10),
  lineHeight: panelScaledPx(14),
} as const;

export const panelTextDimStyle = {
  color: "var(--graph-panel-text-dim)",
  fontSize: panelScaledPx(10),
  lineHeight: panelScaledPx(14),
} as const;

/** Chrome label (panel title, section headings) — smallest tier. */
export const panelChromeStyle: CSSProperties = {
  fontSize: densityPx(9),
  lineHeight: densityCssPx(12),
};

/** Stat value text — slightly bolder than body. */
export const panelStatValueStyle: CSSProperties = {
  fontSize: panelScaledPx(11),
  lineHeight: panelScaledPx(14),
};

/** Panel surface triple — bg + border + shadow from CSS tokens. */
export const panelSurfaceStyle: CSSProperties = {
  backgroundColor: "var(--graph-panel-bg)",
  border: densityBorder("transparent"),
  boxShadow: "var(--graph-panel-shadow)",
};

/** Prompt/overlay surface triple — uses prompt-specific tokens. */
export const promptSurfaceStyle: CSSProperties = {
  backgroundColor: "var(--graph-prompt-bg)",
  border: densityBorder("var(--graph-prompt-border)"),
  boxShadow: "var(--graph-prompt-shadow)",
};

/** Floating chrome pill — matches the prompt-box aesthetic.
 *  CSS-var overrides flatten `.graph-icon-btn` idle chrome so child icons
 *  render as glyphs inside the pill (no double-chrome); hover/pressed tints
 *  still activate from the hover/pressed-bg tokens. */
export const chromePillSurfaceStyle = {
  ...promptSurfaceStyle,
  padding: densityCssPx(3),
  "--graph-control-idle-bg": "transparent",
  "--graph-control-idle-border": "transparent",
} as CSSProperties;

export const panelCardClassName = "rounded-lg px-2 py-1.5";
export const panelCardStyle: CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: densityBorder("var(--graph-panel-border)"),
};

/** Mode-accent tinted card — detail panels, preview blocks, citation items. */
export const panelAccentCardClassName = "rounded-xl px-3 py-3";
export const panelAccentCardStyle: CSSProperties = {
  backgroundColor: "var(--mode-accent-subtle)",
  border: densityBorder("var(--mode-accent-border)"),
};

/** Entity-accent tinted card — wiki entity profiles. Reads --entity-accent
 *  (set by [data-entity-type]) and falls back to --mode-accent. Mixes against
 *  panel bg/border so the tint stays legible in both light and dark. */
export const panelAccentCardEntityClassName = "rounded-xl px-3 py-3";
export const panelAccentCardEntityStyle: CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--entity-accent, var(--mode-accent)) 12%, var(--graph-panel-bg))",
  border: `1px solid color-mix(in srgb, var(--entity-accent, var(--mode-accent)) 20%, var(--graph-panel-border))`,
};

export const panelErrorStyle: CSSProperties = {
  backgroundColor: "var(--feedback-danger-bg)",
  border: densityBorder("var(--feedback-danger-border)"),
};

/**
 * Shared Mantine `styles` for all graph icon buttons.
 * Sets `color` as an inline style so it beats Mantine's internal
 * `color: var(--ai-color)` from the variant system.
 * Hover/active backgrounds are handled by the `.graph-icon-btn` CSS class.
 */
export const iconBtnStyles = {
  root: { color: "var(--graph-control-icon-color, var(--graph-panel-text))" },
} as const;

export const panelIconBtnStyles = {
  root: { color: "var(--graph-panel-text)" },
} as const;

const graphControlShellSize = densityCssPx(36);

/** Shared frame for native graph controls that don't use Mantine ActionIcon. */
export const nativeIconBtnFrameStyle: CSSProperties = {
  width: graphControlShellSize,
  height: graphControlShellSize,
  borderRadius: 9999,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Inner style for native graph controls hosted inside the shared matte shell. */
export const nativeIconBtnInnerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: densityCssPx(9),
  margin: 0,
  background: "transparent",
  border: "none",
  borderRadius: "inherit",
  color: "inherit",
  cursor: "pointer",
  filter: "none",
};

export const disabledNativeIconBtnStyle: CSSProperties = {
  opacity: 0.35,
  pointerEvents: "none",
};

export const graphControlBtnStyles = {
  root: {
    color: "var(--graph-control-icon-color, var(--graph-panel-text))",
    width: graphControlShellSize,
    height: graphControlShellSize,
    minWidth: graphControlShellSize,
    minHeight: graphControlShellSize,
  },
} as const;

/** Badge with mode-accent background — for cluster labels, "Primary" tags. */
export const badgeAccentStyles = {
  root: {
    backgroundColor: "var(--mode-accent-subtle)",
    color: "var(--graph-panel-text)",
    border: densityBorder("var(--mode-accent-border)"),
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
  border: densityBorder("var(--mode-accent-border)"),
} as const;

/** Color tokens for inactive interactive pills (dim/neutral). */
export const pillInactiveColors = {
  backgroundColor: "var(--graph-panel-input-bg)",
  color: "var(--graph-panel-text-dim)",
  border: densityBorder("var(--graph-panel-border)"),
} as const;

/** Base layout for raw-span interactive pills (not Mantine Badge).
 *  `position: relative` + `zIndex: 1` lifts the pill above Mantine Switch's
 *  invisible full-width `<input>` overlay so clicks hit the pill first. */
export const interactivePillBase: CSSProperties = {
  fontSize: panelScaledPx(8),
  lineHeight: 1,
  padding: `${panelScaledPx(1)} ${panelScaledPx(3)}`,
  borderRadius: densityCssPx(3),
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
    height: panelScaledPx(14),
    minHeight: panelScaledPx(14),
    paddingLeft: panelScaledPx(4),
    paddingRight: panelScaledPx(4),
    fontSize: panelScaledPx(8),
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
    height: panelScaledPx(14),
    minHeight: panelScaledPx(14),
    paddingLeft: panelScaledPx(4),
    paddingRight: panelScaledPx(4),
    fontSize: panelScaledPx(8),
    lineHeight: 1,
  },
  label: { lineHeight: 1 },
} as const;

/** Mode-aware accent for Mantine `color` props inside panels. */
export const PANEL_ACCENT = "var(--mode-accent)";

/** Shared label color for Mantine Switch components inside panels. */
export const switchLabelStyle = { label: { color: "var(--graph-panel-text)" } };

/** Compact switch styles — 24×12 track, 10px label matching panelTextStyle. */
export const panelSwitchStyles = {
  label: {
    color: "var(--graph-panel-text)",
    fontSize: panelScaledPx(10),
    lineHeight: panelScaledPx(14),
    paddingLeft: panelScaledPx(6),
  },
  track: {
    minWidth: panelScaledPx(24),
    height: panelScaledPx(12),
    borderColor: "var(--graph-panel-border)",
  },
  thumb: {
    width: panelScaledPx(10),
    height: panelScaledPx(10),
    borderColor: "var(--graph-panel-border)",
  },
} as const;

/** Shared label style for section headings inside panels. */
export const sectionLabelStyle: CSSProperties = {
  fontSize: panelScaledPx(9),
  lineHeight: panelScaledPx(12),
  color: "var(--graph-panel-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

/** Shared style for table column headers inside panels. */
export const panelTableHeaderStyle: CSSProperties = {
  fontSize: panelScaledPx(9),
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
    minHeight: panelScaledPx(22),
    height: panelScaledPx(22),
    fontSize: panelScaledPx(10),
    borderRadius: densityCssPx(6),
    paddingLeft: panelScaledPx(8),
    paddingRight: panelScaledPx(20),
  },
  label: {
    color: "var(--graph-panel-text-muted)",
    fontSize: panelScaledPx(9),
    lineHeight: panelScaledPx(12),
  },
  option: {
    fontSize: panelScaledPx(10),
    padding: `${panelScaledPx(3)} ${panelScaledPx(6)}`,
    borderRadius: densityCssPx(5),
  },
  dropdown: {
    borderRadius: densityCssPx(8),
    padding: panelScaledPx(3),
  },
} as const;
