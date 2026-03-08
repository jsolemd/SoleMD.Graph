"use client";

import { BrainCircuit } from "lucide-react";
import { useComputedColorScheme } from "@mantine/core";

export default function GraphLoading() {
  const scheme = useComputedColorScheme("light");
  const isDark = scheme === "dark";

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--graph-bg)]">
      {/* Wordmark placeholder */}
      <div className="fixed top-6 left-6 z-50 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: isDark ? "#a8c5e9" : "#747caa" }}
        >
          <BrainCircuit size={16} color="white" />
        </div>
        <span
          className="text-lg font-semibold"
          style={{ opacity: 0.5, color: isDark ? "#fff" : "#1a1b1e" }}
        >
          SoleMD
        </span>
      </div>

      {/* Center loading pulse */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-3 w-3 rounded-full animate-pulse"
          style={{ backgroundColor: isDark ? "#a8c5e9" : "#747caa" }}
        />
        <span
          className="text-sm"
          style={{ opacity: 0.4, color: isDark ? "#fff" : "#1a1b1e" }}
        >
          Loading knowledge graph...
        </span>
      </div>

      {/* PromptBox shell placeholder */}
      <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
        <div
          className="h-14 w-[min(600px,90vw)] rounded-full backdrop-blur-xl animate-pulse"
          style={{
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
          }}
        />
      </div>
    </div>
  );
}
