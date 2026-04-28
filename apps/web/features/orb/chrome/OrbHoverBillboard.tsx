"use client";

import { useEffect, useState } from "react";
import type { GraphBundleQueries } from "@solemd/graph";

import { useDashboardStore } from "@/features/graph/stores";
import {
  panelSurfaceStyle,
  panelTextDimStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

interface HoverLabel {
  label: string;
  year: number | null;
}

export interface OrbHoverBillboardProps {
  cursor: { x: number; y: number } | null;
  enabled?: boolean;
  queries: GraphBundleQueries | null;
}

function buildHoverLabelSql(particleIndex: number): string {
  return `
    SELECT
      COALESCE(points.displayLabel, points.paperTitle, points.citekey, sample.paperId, sample.id) AS label,
      points.year AS year
    FROM paper_sample sample
    LEFT JOIN base_points_web points
      ON points.id = sample.id
    WHERE sample.particleIdx = ${Math.trunc(particleIndex)}
    LIMIT 1
  `;
}

function readHoverLabel(row: Record<string, unknown> | undefined): HoverLabel | null {
  if (!row) return null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!label) return null;
  const year = Number(row.year);
  return {
    label,
    year: Number.isInteger(year) ? year : null,
  };
}

export function OrbHoverBillboard({
  cursor,
  enabled = true,
  queries,
}: OrbHoverBillboardProps) {
  const hoverIndex = useOrbFocusVisualStore((s) => s.hoverIndex);
  const showHoveredPointLabel = useDashboardStore((s) => s.showHoveredPointLabel);
  const [label, setLabel] = useState<HoverLabel | null>(null);

  useEffect(() => {
    if (!enabled || !showHoveredPointLabel || !queries || hoverIndex == null) {
      setLabel(null);
      return;
    }

    let cancelled = false;
    void queries
      .runReadOnlyQuery(buildHoverLabelSql(hoverIndex))
      .then((result) => {
        if (!cancelled) setLabel(readHoverLabel(result.rows[0]));
      })
      .catch(() => {
        if (!cancelled) setLabel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, hoverIndex, queries, showHoveredPointLabel]);

  if (!enabled || !showHoveredPointLabel || !cursor || !label) return null;

  return (
    <div
      className="pointer-events-none fixed z-40 max-w-72 rounded-lg px-3 py-2"
      style={{
        ...panelSurfaceStyle,
        left: cursor.x + 14,
        top: cursor.y + 14,
      }}
    >
      <div style={panelTextStyle}>{label.label}</div>
      {label.year ? <div style={panelTextDimStyle}>{label.year}</div> : null}
    </div>
  );
}

export { buildHoverLabelSql, readHoverLabel };
