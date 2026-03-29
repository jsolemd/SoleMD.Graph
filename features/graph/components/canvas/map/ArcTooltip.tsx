import type { HoveredArc } from "@/features/graph/hooks/use-deck-arcs";

export function ArcTooltip({ arc, isDark }: { arc: HoveredArc; isDark: boolean }) {
  return (
    <div
      role="tooltip" aria-live="polite"
      className="pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        left: Math.min(arc.x + 12, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200),
        top: Math.max(arc.y - 12, 40),
        background: isDark ? "rgba(30,30,35,0.92)" : "rgba(255,255,255,0.95)",
        color: isDark ? "#e4e4e9" : "#1a1b1e",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
      }}
    >
      <div className="font-medium">{arc.source}</div>
      <div className="text-[10px] opacity-60">↔</div>
      <div className="font-medium">{arc.target}</div>
      <div className="mt-1 opacity-70">{arc.paperCount} paper{arc.paperCount !== 1 ? "s" : ""}</div>
    </div>
  );
}
