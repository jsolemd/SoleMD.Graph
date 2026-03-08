"use client";

import { useComputedColorScheme } from "@mantine/core";
import { formatNumber } from "@/lib/helpers";
import type { GraphStats } from "@/lib/graph/types";

export function StatsBar({ stats }: { stats: GraphStats }) {
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";

  const items = [
    { label: "chunks", value: stats.chunks },
    { label: "papers", value: stats.papers },
    { label: "clusters", value: stats.clusters },
    { label: "noise", value: stats.noise },
  ];

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex gap-4 text-xs select-none"
      style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)" }}
    >
      {items.map((item) => (
        <span key={item.label}>
          <span className="font-medium" style={{ opacity: 1.0 }}>
            {formatNumber(item.value)}
          </span>{" "}
          {item.label}
        </span>
      ))}
    </div>
  );
}
