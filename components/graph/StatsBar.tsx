"use client";

import { useMemo } from "react";
import { formatNumber } from "@/lib/helpers";
import type { GraphStats } from "@/lib/graph/types";

export function StatsBar({ stats }: { stats: GraphStats }) {
  const items = useMemo(() => {
    const result = [
      { label: stats.pointLabel, value: stats.points },
    ];
    // Show papers count only on chunk layer (cross-reference)
    if (stats.pointLabel === 'chunks') {
      result.push({ label: "papers", value: stats.papers });
    }
    result.push(
      { label: "clusters", value: stats.clusters },
      { label: "noise", value: stats.noise },
    );
    return result;
  }, [stats]);

  return (
    <div
      className="flex gap-4 text-xs select-none"
      style={{ color: "var(--graph-stats-text)" }}
    >
      {items.map((item) => (
        <span key={item.label}>
          <span className="font-medium">{formatNumber(item.value)}</span>{" "}
          {item.label}
        </span>
      ))}
    </div>
  );
}
