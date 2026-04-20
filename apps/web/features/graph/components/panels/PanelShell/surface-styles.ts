"use client";

import type { CSSProperties } from "react";
import { densityCssPx } from "@/lib/density";
import { panelScaledPx } from "./panel-styles";

const transparentBorder = `${densityCssPx(1)} solid transparent`;

/** Elevated floating card — overlay modals, fullscreen viewers.
 *  Matches the prompt/popover family: tonal lift (surface-raised) + rim light
 *  in dark mode, subtle shadow in light. No visible border, pure matte. */
export const overlayCardSurfaceStyle: CSSProperties = {
  backgroundColor: "var(--graph-prompt-bg)",
  border: transparentBorder,
  boxShadow: "var(--graph-prompt-shadow)",
};

export const overlayScrimStyle: CSSProperties = {
  backgroundColor: "var(--graph-overlay-scrim)",
};

export const overlayStrongScrimStyle: CSSProperties = {
  backgroundColor: "var(--graph-overlay-scrim-strong)",
};

/** Inset code block — darker tonal tier within a panel. Borderless matte:
 *  the bg difference carries the "inset" read in both modes. */
export const insetCodeBlockStyle: CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: transparentBorder,
  color: "var(--graph-panel-text-dim)",
  fontSize: panelScaledPx(9),
  lineHeight: panelScaledPx(13),
  padding: `${panelScaledPx(4)} ${panelScaledPx(6)}`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

/** Inset table frame — borderless. Uses input-bg for tonal containment. */
export const insetTableFrameStyle: CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: transparentBorder,
  borderRadius: panelScaledPx(8),
  overflow: "auto",
};

/** Compact metadata pill. Borderless — the tonal bg tier is the differentiator. */
export const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: panelScaledPx(8),
  lineHeight: 1,
  padding: `${panelScaledPx(2)} ${panelScaledPx(4)}`,
  borderRadius: densityCssPx(4),
  whiteSpace: "nowrap",
  backgroundColor: "var(--graph-panel-input-bg)",
  color: "var(--graph-panel-text-dim)",
};

export const compactSegmentedControlStyles = {
  root: {
    backgroundColor: "var(--graph-panel-input-bg)",
    border: transparentBorder,
    borderRadius: densityCssPx(6),
    padding: densityCssPx(2),
    gap: densityCssPx(2),
  },
  label: {
    fontSize: panelScaledPx(9),
    lineHeight: 1,
    padding: `${panelScaledPx(3)} ${panelScaledPx(6)}`,
  },
  indicator: {
    borderRadius: densityCssPx(4),
    boxShadow: "none",
  },
} as const;
