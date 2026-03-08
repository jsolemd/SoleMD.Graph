"use client";

import { BrainCircuit } from "lucide-react";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useGraphStore } from "@/lib/graph/store";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { getModeConfig } from "@/lib/graph/modes";

export function Wordmark() {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const { layout, color: modeColor } = getModeConfig(mode);

  // Shift right when a left-side panel is open
  const hasLeftPanel =
    layout.showToolbar && activePanel !== null;

  return (
    <div
      className="absolute top-3 z-40 flex items-center gap-3 transition-all duration-200"
      style={{ left: hasLeftPanel ? 312 : 12 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300"
          style={{ backgroundColor: modeColor }}
        >
          <BrainCircuit size={16} color="white" />
        </div>
        <span
          className="text-lg font-semibold select-none"
          style={{ color: "var(--graph-wordmark-text)" }}
        >
          Sole
          <span className="transition-colors duration-300" style={{ color: modeColor }}>MD</span>
        </span>
      </div>
      <ThemeToggle />
    </div>
  );
}
