"use client";

import { motion } from "framer-motion";
import { useMemo, type CSSProperties } from "react";

import {
  selectBottomClearance,
  useDashboardStore,
} from "@/features/graph/stores";
import {
  panelSurfaceStyle,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { APP_CHROME_PX } from "@/lib/density";
import { crisp } from "@/lib/motion";
import type { PaperAttributesState } from "../bake/use-paper-attributes-baker";
import { useOrbGeometryMutationStore } from "../stores/geometry-mutation-store";

const legendStyle = {
  ...panelSurfaceStyle,
  borderRadius: 12,
  padding: 10,
  minWidth: 180,
  maxWidth: 240,
} satisfies CSSProperties;

const swatchStyle = (color: string) =>
  ({
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color,
    boxShadow: `0 0 12px ${color}`,
    flexShrink: 0,
  }) satisfies CSSProperties;

const sizeSwatches = [
  { label: "q05", size: 7 },
  { label: "mid", size: 13 },
  { label: "q98", size: 22 },
] as const;

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

function expm1Safe(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.expm1(value));
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden style={swatchStyle(color)} />
      <span style={panelTextStyle}>{label}</span>
    </div>
  );
}

function HighlightLegend() {
  return (
    <div className="flex flex-col gap-2">
      <div style={sectionLabelStyle}>Highlights</div>
      <LegendRow color="var(--color-warm-coral)" label="Evidence pulse" />
      <LegendRow color="var(--mode-accent)" label="Focus / hover" />
      <LegendRow color="var(--filter-bar-active)" label="Selected neighbors" />
      <LegendRow color="var(--filter-bar-base)" label="Filtered dim" />
    </div>
  );
}

function SizeLegend({ paperState }: { paperState: PaperAttributesState }) {
  const stats = paperState.stats;
  const entityCounts = useMemo(() => {
    if (!stats) return null;
    return [
      expm1Safe(stats.entityLo),
      expm1Safe((stats.entityLo + stats.entityHi) / 2),
      expm1Safe(stats.entityHi),
    ];
  }, [stats]);

  return (
    <div className="flex flex-col gap-2">
      <div style={sectionLabelStyle}>Paper size</div>
      <div className="flex items-end gap-3">
        {sizeSwatches.map((swatch, index) => (
          <div key={swatch.label} className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              style={{
                width: swatch.size,
                height: swatch.size,
                borderRadius: 999,
                background: "var(--mode-accent)",
                opacity: 0.72,
                boxShadow: "0 0 16px color-mix(in srgb, var(--mode-accent) 45%, transparent)",
              }}
            />
            <span style={panelTextDimStyle}>
              {entityCounts ? formatCount(entityCounts[index] ?? 0) : swatch.label}
            </span>
          </div>
        ))}
      </div>
      <div style={panelTextDimStyle}>
        {stats
          ? "Entity-count anchored"
          : paperState.status === "ready"
            ? "No size stats"
            : "Waiting for paper stats"}
      </div>
    </div>
  );
}

export function OrbLegendOverlay({
  paperState,
}: {
  paperState: PaperAttributesState;
}) {
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const bottomClearance = useDashboardStore(selectBottomClearance);
  const chunkCount = useOrbGeometryMutationStore((s) => s.chunks.length);

  if (uiHidden || (!showColorLegend && !showSizeLegend)) return null;

  const legendBottom = APP_CHROME_PX.edgeMargin + bottomClearance;

  return (
    <motion.div
      className="pointer-events-auto absolute right-4 z-30 flex flex-col gap-2"
      initial={{ bottom: legendBottom, opacity: 0, scale: 0.96 }}
      animate={{ bottom: legendBottom, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={crisp}
      style={legendStyle}
    >
      {showColorLegend ? <HighlightLegend /> : null}
      {showColorLegend && showSizeLegend ? (
        <div
          aria-hidden
          style={{
            height: 1,
            background: "var(--graph-panel-border)",
            marginBlock: 2,
          }}
        />
      ) : null}
      {showSizeLegend ? <SizeLegend paperState={paperState} /> : null}
      <div style={panelTextDimStyle}>
        {paperState.count?.toLocaleString() ?? "0"} resident papers · {chunkCount} chunks
      </div>
    </motion.div>
  );
}
