"use client";

import { useMemo } from "react";
import { formatNumber } from "@/lib/helpers";
import type { GraphStats } from "@/features/graph/types";

export function StatsBar({ stats }: { stats: GraphStats }) {
  const items = useMemo(() => {
    return [
      { label: stats.pointLabel, value: stats.points },
      { label: "clusters", value: stats.clusters },
      { label: "noise", value: stats.noise },
    ];
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
