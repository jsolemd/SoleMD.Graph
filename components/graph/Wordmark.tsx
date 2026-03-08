"use client";

import { BrainCircuit } from "lucide-react";
import { useComputedColorScheme } from "@mantine/core";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";

export function Wordmark() {
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const isExplore = mode === "explore";
  const hasLeftPanel = isExplore && (activePanel === "config" || activePanel === "filters");

  return (
    <div
      className="absolute z-40 flex items-center gap-3 transition-all duration-200"
      style={{
        top: 12,
        left: hasLeftPanel ? 312 : 12,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: isDark ? "#a8c5e9" : "#747caa" }}
        >
          <BrainCircuit size={16} color="white" />
        </div>
        <span
          className="text-lg font-semibold select-none"
          style={{ color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}
        >
          Sole
          <span style={{ color: isDark ? "#a8c5e9" : "#747caa" }}>MD</span>
        </span>
      </div>
      <ThemeToggle />
    </div>
  );
}
