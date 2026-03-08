"use client";

import { formatNumber } from "@/lib/helpers";
import type { GraphStats } from "@/lib/graph/types";

export function StatsBar({ stats }: { stats: GraphStats }) {
  const items = [
    { label: "chunks", value: stats.chunks },
    { label: "papers", value: stats.papers },
    { label: "clusters", value: stats.clusters },
    { label: "noise", value: stats.noise },
  ];

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex gap-4 text-xs select-none"
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
