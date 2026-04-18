"use client";
/**
 * ActivityLucide — lucide icon wrapper.
 *
 * Source:        Lucide (lucide.dev)
 * License:       ISC
 * Original URL:  https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg
 * Glyph:         activity
 *
 * Path geometry is inlined verbatim; only the motion wrapper and card
 * shell are hand-authored. Matches the 280px breath pattern used by
 * _smoke/noto-brain/NotoBrain.tsx.
 */
// TODO: recolor fills to brand tokens (var(--color-soft-pink),
// color-mix(in srgb, ...), etc.) before shipping.
import { motion, useReducedMotion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

export default function ActivityLucide() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      {...canvasReveal}
      className="flex h-[280px] w-full items-center justify-center"
    >
      <motion.svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto max-h-[260px]"
        role="img"
        aria-label="activity (lucide)"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={reduced ? { scale: 1, opacity: 1 } : { scale: [1, 1.03, 1], opacity: 1 }}
        transition={
          reduced
            ? { duration: 0.3, ease: "easeOut" }
            : {
                scale: { duration: 2.4, ease: "easeInOut", repeat: Infinity },
                opacity: { duration: 0.3, ease: "easeOut" },
              }
        }
        style={{ transformOrigin: "center" }}
      >
        <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
      </motion.svg>
    </motion.div>
  );
}
