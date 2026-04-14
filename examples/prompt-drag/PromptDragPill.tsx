"use client";

/**
 * PromptDragPill — extracted from the pre-2026-04-14 PromptBoxSurface.
 *
 * The pill sits at the bottom center of the prompt card. It doubles as:
 *   - a visual drag/grab affordance (widens + brightens when the box is dragged
 *     off its auto-centered position),
 *   - a one-click recenter button that snaps the box back to the auto target.
 *
 * Reference implementation. Not wired into the live prompt box — the drag
 * feature was removed in favor of a fixed bottom-centered prompt.
 */
import { motion } from "framer-motion";
import { densityCssSpace, densityPx } from "@/lib/density";

export interface PromptDragPillProps {
  isCollapsed: boolean;
  /** true when the user has dragged the box away from its auto position */
  isOffset: boolean;
  /** snaps the box back to the auto target */
  onRecenter: () => void;
}

export function PromptDragPill({
  isCollapsed,
  isOffset,
  onRecenter,
}: PromptDragPillProps) {
  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onRecenter();
      }}
      style={{
        position: "absolute",
        bottom: isCollapsed ? -densityPx(6) : 0,
        left: "50%",
        transform: "translateX(-50%)",
        padding: densityCssSpace(12, 8),
        cursor: isOffset ? "pointer" : "default",
      }}
    >
      <motion.div
        style={{
          height: 2,
          borderRadius: 1,
          backgroundColor: "var(--graph-prompt-divider)",
        }}
        initial={false}
        animate={{
          width: isOffset ? 32 : 20,
          opacity: isOffset ? 0.7 : 0.4,
        }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}
