"use client";

import type { CSSProperties } from "react";
import { densityCssPx } from "@/lib/density";
import { panelScaledPx } from "./panel-styles";

const surfaceBorder = (color: string) => `${densityCssPx(1)} solid ${color}`;

export const overlayCardSurfaceStyle: CSSProperties = {
  backgroundColor: "var(--surface)",
  border: surfaceBorder("var(--border-default)"),
  boxShadow: "var(--shadow-lg)",
};

export const overlayScrimStyle: CSSProperties = {
  backgroundColor: "var(--graph-overlay-scrim)",
};

export const overlayStrongScrimStyle: CSSProperties = {
  backgroundColor: "var(--graph-overlay-scrim-strong)",
};

export const insetCodeBlockStyle: CSSProperties = {
  backgroundColor: "var(--graph-panel-input-bg)",
  border: surfaceBorder("var(--graph-panel-border)"),
  color: "var(--graph-panel-text-dim)",
  fontSize: panelScaledPx(9),
  lineHeight: panelScaledPx(13),
  padding: `${panelScaledPx(4)} ${panelScaledPx(6)}`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export const insetTableFrameStyle: CSSProperties = {
  border: surfaceBorder("var(--graph-panel-border)"),
  borderRadius: panelScaledPx(8),
  overflow: "auto",
};

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
  border: surfaceBorder("var(--graph-panel-border)"),
};

export const compactSegmentedControlStyles = {
  root: {
    backgroundColor: "var(--graph-panel-input-bg)",
    border: surfaceBorder("var(--graph-panel-border)"),
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
